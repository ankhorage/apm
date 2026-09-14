import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import type {
  ApmPlanDigestPort,
  ApmPlanProtocolPort,
  ApmPlanResolutionPort,
} from '../../../types/plan.js';
import type { ApmStatusResult } from '../../../types/status.js';
import type { ApmUpdateDescriptor } from '../../../types/update-protocol.js';
import { resolveMigrationPath } from '../../update-protocol/domain/resolveMigrationPath.js';
import { planAsync } from './planAsync.js';

const DIGEST: ApmPlanDigestPort = {
  digestAsync: (value) => Promise.resolve(createHash('sha256').update(value).digest('hex')),
};

test('skipping releases preserves the complete deterministic package-owned migration path', async () => {
  const plan = await planAsync(
    {
      status: migrationStatusFixture(),
      policy: {
        dependencyUpdates: 'selected',
        selections: [
          {
            selector: { name: '@owner/package', installRootId: 'root', ownerPath: 'package.json' },
            target: { kind: 'version', version: '3.0.0', manifestRange: '^3.0.0' },
          },
        ],
      },
      executor: { apmVersion: '0.3.0', runtime: 'node', runtimeVersion: '24.0.0' },
    },
    {
      digest: DIGEST,
      resolution: migrationResolutionPort(),
      protocol: migrationProtocolPort(),
    },
  );

  expect(plan.complete).toBe(true);
  expect(plan.steps.map(({ id }) => id)).toEqual([
    'dependency-files:root',
    'install:root',
    'migration:@owner/package:1-to-2',
    'migration:@owner/package:2-to-3',
    'validation:project',
    'follow-up:ota-eligibility:0',
  ]);
});

/*** Resolve the selected target graph without executing migration code during planning. */
function migrationResolutionPort(): ApmPlanResolutionPort {
  return {
    resolveAsync: (request) =>
      Promise.resolve({
        installRootId: request.installRootId,
        complete: true,
        manager: request.manager,
        files: [
          {
            path: 'package-lock.json',
            kind: 'update',
            beforeDigest: 'owner-v1-lock',
            afterDigest: 'owner-v3-lock',
          },
        ],
        packages: [
          {
            id: 'root::node_modules/@owner/package',
            name: '@owner/package',
            version: '3.0.0',
            direct: true,
            source: 'registry',
            dependencies: [],
          },
        ],
        artifacts: [
          {
            id: 'root::node_modules/@owner/package',
            packageName: '@owner/package',
            version: '3.0.0',
            source: 'registry',
            integrity: 'sha512-owner-v3',
          },
        ],
        effects: {
          projectWrites: false,
          lifecycleScripts: false,
          network: 'allowed',
          cache: 'manager-default',
        },
        blockers: [],
        diagnostics: [],
      }),
  };
}

/*** Resolve the real update-protocol migration graph and expose its ordered steps to APM planning. */
function migrationProtocolPort(): ApmPlanProtocolPort {
  return {
    planProtocolAsync: ({ targets }) => {
      const target = targets.find(({ name }) => name === '@owner/package');
      const path = resolveMigrationPath({
        descriptor: migrationDescriptor(),
        sourceVersion: '1.0.0',
        targetVersion: target?.targetVersion ?? '',
      });
      if (!path.supported) {
        return Promise.resolve({
          complete: false,
          requiredSelections: [],
          files: [],
          artifacts: [],
          steps: [],
          effects: [],
          findings: [],
          blockers: path.blockers,
          diagnostics: [],
        });
      }
      return Promise.resolve({
        complete: true,
        requiredSelections: [],
        files: [],
        artifacts: [],
        steps: path.migrations.map((migration, index) => ({
          id: `migration:@owner/package:${migration.id}`,
          kind: 'migration' as const,
          prerequisites:
            index === 0
              ? ['install:root']
              : [`migration:@owner/package:${path.migrations[index - 1]?.id ?? ''}`],
          owner: '@owner/package',
          reason: `Apply reviewed skipped-version migration ${migration.id}.`,
          evidence: [migration.id, migration.checksum],
        })),
        effects: [],
        findings: [],
        blockers: [],
        diagnostics: [],
      });
    },
  };
}

/*** Define a package-owned v1 -> v2 -> v3 path requiring the intermediate v2 artifact. */
function migrationDescriptor(): ApmUpdateDescriptor {
  return {
    protocolVersion: 1,
    schemaVersion: 1,
    owner: { name: '@owner/package', version: '3.0.0' },
    history: {
      supported: [{ sourceRange: '>=1.0.0 <3.0.0', mode: 'automatic' }],
      unsupported: [],
      downgrade: 'unsupported',
    },
    compatibility: [],
    migrations: [
      migration('1-to-2', '>=1.0.0 <2.0.0', '2.0.0', 'intermediate', []),
      migration('2-to-3', '>=2.0.0 <3.0.0', '3.0.0', 'target', [
        { owner: '@owner/package', migrationId: '1-to-2' },
      ]),
    ],
    projections: [],
    effects: [],
  };
}

/*** Build one immutable migration descriptor edge for the skipped-release fixture. */
function migration(
  id: string,
  sourceRange: string,
  targetVersion: string,
  artifact: 'intermediate' | 'target',
  prerequisites: ApmUpdateDescriptor['migrations'][number]['prerequisites'],
): ApmUpdateDescriptor['migrations'][number] {
  return {
    id,
    checksum: `sha256:${id}`,
    from: { packageRange: sourceRange },
    to: { packageVersion: targetVersion },
    phase: 'post-install',
    implementation: {
      artifact,
      ...(artifact === 'intermediate' ? { version: targetVersion } : {}),
    },
    prerequisites,
    affectedScopes: [{ kind: 'file', path: 'app.json' }],
    sideEffects: ['project-files'],
    verification: [{ kind: 'manual', description: `Verify ${id}` }],
    recovery: { idempotent: true, restartable: true, reversible: false },
  };
}

/*** Build complete status evidence for an installed v1 package with an explicit v3 target available. */
function migrationStatusFixture(): ApmStatusResult {
  const dependency = ownerDependencyFixture();
  return {
    schemaVersion: 2,
    operation: 'status',
    rootPath: '/project',
    complete: true,
    currency: 'outdated',
    project: {
      traits: [],
      languages: [],
      packageManagers: ['npm'],
      buildTools: [],
      packageCount: 1,
      workspaceCount: 0,
    },
    installRoots: [ownerInstallRootFixture(dependency)],
    dependencies: [dependency],
    hosts: [],
    extensions: {
      state: 'available',
      complete: true,
      observations: [
        {
          packageId: dependency.packageId,
          owner: '@owner/package',
          projection: 'current',
          migration: 'pending',
          evidence: ['1.0.0 -> 3.0.0'],
        },
      ],
      diagnostics: [],
    },
    findings: [],
    diagnostics: [],
  };
}

/*** Build the current direct owner dependency instance. */
function ownerDependencyFixture(): ApmStatusResult['dependencies'][number] {
  return {
    packageId: 'node_modules/@owner/package',
    installRootId: 'root',
    name: '@owner/package',
    direct: true,
    declaration: {
      ownerPath: 'package.json',
      name: '@owner/package',
      range: '^1.0.0',
      kind: 'dependency',
      resolvedPackageId: 'node_modules/@owner/package',
    },
    lockedVersion: '1.0.0',
    installed: {
      packageId: 'node_modules/@owner/package',
      state: 'present',
      source: 'node-modules',
      version: '1.0.0',
    },
    availability: {
      packageId: 'node_modules/@owner/package',
      name: '@owner/package',
      state: 'known',
      latestVersion: '3.0.0',
      compatibleVersion: '1.0.0',
    },
    dependencyPaths: [['root::node_modules/@owner/package']],
    findings: [],
  };
}

/*** Build the npm root containing the current owner package instance. */
function ownerInstallRootFixture(
  dependency: ApmStatusResult['dependencies'][number],
): ApmStatusResult['installRoots'][number] {
  return {
    id: 'root',
    rootPath: '/project',
    packagePaths: ['/project'],
    manager: { state: 'selected', name: 'npm', version: '11.0.0', source: 'package-manager-field' },
    lockfile: {
      state: 'supported',
      path: '/project/package-lock.json',
      format: 'npm-package-lock',
      version: '3',
      evidence: ['package-lock.json'],
    },
    declarations: dependency.declaration === undefined ? [] : [dependency.declaration],
    lockedPackages: [
      {
        id: dependency.packageId,
        name: dependency.name,
        version: '1.0.0',
        source: 'registry',
        optional: false,
        dependencies: [],
      },
    ],
    installedPackages: [dependency.installed],
    complete: true,
    diagnostics: [],
  };
}

import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import type {
  ApmPlanDigestPort,
  ApmPlanPorts,
  ApmPlanProtocolPort,
  ApmPlanResolutionPort,
} from '../../../types/plan.js';
import type { ApmStatusResult } from '../../../types/status.js';
import { validateSavedPlanAsync } from '../domain/validateSavedPlanAsync.js';
import { planAsync } from './planAsync.js';

const DIGEST: ApmPlanDigestPort = {
  digestAsync: (value) => Promise.resolve(createHash('sha256').update(value).digest('hex')),
};

const EXECUTOR = { apmVersion: '0.3.0', runtime: 'node' as const, runtimeVersion: '24.0.0' };

test('semantic input fingerprints and plan IDs ignore registry freshness timestamps', async () => {
  const first = await planAsync(planInput(statusFixture('2026-09-14T10:00:00.000Z')), portsFixture());
  const second = await planAsync(planInput(statusFixture('2026-09-14T11:00:00.000Z')), portsFixture());

  expect(first.inputFingerprint.value).toBe(second.inputFingerprint.value);
  expect(first.id).toBe(second.id);
  expect(first.inputFingerprint.availabilityCheckedAt).not.toEqual(
    second.inputFingerprint.availabilityCheckedAt,
  );
});

test('plan composes native resolution, protocol steps, validation and explicit shipment effects', async () => {
  const plan = await planAsync(planInput(statusFixture()), portsFixture(protocolPortFixture()));

  expect(plan.complete).toBe(true);
  expect(plan.targets[0]).toMatchObject({ name: 'example-package', targetVersion: '1.2.0' });
  expect(plan.files.map(({ path }) => path)).toEqual(['generated.json', 'package-lock.json']);
  expect(plan.steps.map(({ id }) => id)).toEqual([
    'dependency-files:root',
    'install:root',
    'migration:@owner/package:m1',
    'projection:@owner/package:generated',
    'validation:project',
    'follow-up:ota-eligibility:1',
    'follow-up:web-rebuild:0',
  ]);
  expect(plan.effects).toContainEqual({
    kind: 'ota-eligibility',
    eligibility: 'unknown',
    evidence: [],
    reason: 'Dependency graph changes have no protocol evidence proving OTA eligibility.',
  });
});

test('incomplete status blocks native resolution instead of manufacturing a partial executable plan', async () => {
  const calls: string[] = [];
  const resolution: ApmPlanResolutionPort = {
    resolveAsync: (request) => {
      calls.push(request.installRootId);
      return Promise.resolve(resolutionResult());
    },
  };
  const plan = await planAsync(planInput({ ...statusFixture(), complete: false }), {
    digest: DIGEST,
    resolution,
  });

  expect(calls).toEqual([]);
  expect(plan.complete).toBe(false);
  expect(plan.blockers.map(({ code }) => code)).toContain('plan.status-incomplete');
});

test('saved plans reject changed semantic input and incompatible executors', async () => {
  const plan = await planAsync(planInput(statusFixture()), portsFixture());
  const changed = changedStatusFixture();
  const blockers = await validateSavedPlanAsync(
    plan,
    changed,
    { ...EXECUTOR, apmVersion: '0.4.0' },
    DIGEST,
  );

  expect(blockers.map(({ code }) => code)).toEqual([
    'plan.input-changed',
    'plan.executor-incompatible',
  ]);
});

/*** Build canonical plan input around one immutable status snapshot. */
function planInput(status: ApmStatusResult) {
  return { status, executor: EXECUTOR };
}

/*** Build deterministic resolver/protocol ports for core planning behavior tests. */
function portsFixture(protocol?: ApmPlanProtocolPort): ApmPlanPorts {
  return {
    digest: DIGEST,
    resolution: { resolveAsync: () => Promise.resolve(resolutionResult()) },
    ...(protocol === undefined ? {} : { protocol }),
  };
}

/*** Build one native package-manager resolution result with exact reviewed file content. */
function resolutionResult(): Awaited<ReturnType<ApmPlanResolutionPort['resolveAsync']>> {
  return {
    installRootId: 'root',
    complete: true,
    manager: 'npm',
    managerVersion: '11.0.0',
    files: [
      {
        path: 'package-lock.json',
        kind: 'update',
        beforeDigest: 'lock-before',
        afterDigest: 'lock-after',
        beforeContent: '{"old":true}',
        afterContent: '{"new":true}',
      },
    ],
    packages: [
      {
        id: 'example-package@1.2.0',
        name: 'example-package',
        version: '1.2.0',
        direct: true,
        source: 'registry',
        integrity: 'sha512-example',
        dependencies: [],
      },
    ],
    artifacts: [
      {
        id: 'example-package@1.2.0',
        packageName: 'example-package',
        version: '1.2.0',
        source: 'registry',
        integrity: 'sha512-example',
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
  };
}

/*** Build package-owned migration/projection planning evidence chained after dependency installation. */
function protocolPortFixture(): ApmPlanProtocolPort {
  return {
    planProtocolAsync: () =>
      Promise.resolve({
        complete: true,
        files: [
          {
            path: 'generated.json',
            kind: 'update',
            beforeDigest: 'generated-before',
            afterDigest: 'generated-after',
            beforeContent: '{}',
            afterContent: '{"version":2}',
          },
        ],
        artifacts: [],
        steps: [
          {
            id: 'migration:@owner/package:m1',
            kind: 'migration',
            prerequisites: ['install:root'],
            owner: '@owner/package',
            reason: 'Transform supported schema state.',
            evidence: ['m1'],
          },
          {
            id: 'projection:@owner/package:generated',
            kind: 'projection',
            prerequisites: ['migration:@owner/package:m1'],
            owner: '@owner/package',
            reason: 'Materialize target generator projection.',
            evidence: ['generated'],
          },
        ],
        effects: [
          {
            kind: 'web-rebuild',
            requirement: 'required',
            evidence: ['dependency graph changed'],
            reason: 'Web bundle must be rebuilt.',
          },
        ],
        findings: [],
        blockers: [],
        diagnostics: [],
      }),
  };
}

/*** Build one complete npm status snapshot with a compatible direct update. */
function statusFixture(checkedAt = '2026-09-14T10:00:00.000Z'): ApmStatusResult {
  const dependency = dependencyFixture(checkedAt);
  return {
    schemaVersion: 2,
    operation: 'status',
    rootPath: '/project',
    complete: true,
    currency: 'outdated',
    project: projectSummaryFixture(),
    installRoots: [installRootFixture(dependency)],
    dependencies: [dependency],
    hosts: [],
    extensions: { state: 'unavailable', complete: true, observations: [], diagnostics: [] },
    findings: [],
    diagnostics: [],
  };
}

/*** Change one semantic declaration while retaining otherwise equivalent status evidence. */
function changedStatusFixture(): ApmStatusResult {
  const status = statusFixture();
  const [dependency] = status.dependencies;
  if (dependency?.declaration === undefined) return status;
  const changedDependency = {
    ...dependency,
    declaration: { ...dependency.declaration, range: '^2.0.0' },
  };
  return {
    ...status,
    dependencies: [changedDependency],
    installRoots: [installRootFixture(changedDependency)],
  };
}

/*** Build one minimal JS project summary for planning tests. */
function projectSummaryFixture(): ApmStatusResult['project'] {
  return {
    traits: [],
    languages: [],
    packageManagers: ['npm'],
    buildTools: [],
    packageCount: 1,
    workspaceCount: 0,
  };
}

/*** Build one direct dependency with compatible and latest registry evidence. */
function dependencyFixture(checkedAt: string): ApmStatusResult['dependencies'][number] {
  return {
    packageId: 'example-package@1.0.0',
    installRootId: 'root',
    name: 'example-package',
    direct: true,
    declaration: {
      ownerPath: 'package.json',
      name: 'example-package',
      range: '^1.0.0',
      kind: 'dependency',
      resolvedPackageId: 'example-package@1.0.0',
    },
    lockedVersion: '1.0.0',
    installed: {
      packageId: 'example-package@1.0.0',
      state: 'present',
      source: 'node-modules',
      version: '1.0.0',
    },
    availability: {
      packageId: 'example-package@1.0.0',
      name: 'example-package',
      state: 'known',
      checkedAt,
      latestVersion: '2.0.0',
      compatibleVersion: '1.2.0',
    },
    dependencyPaths: [['example-package@1.0.0']],
    findings: [],
  };
}

/*** Build one npm install-root snapshot matching the direct dependency fixture. */
function installRootFixture(
  dependency: ApmStatusResult['dependencies'][number],
): ApmStatusResult['installRoots'][number] {
  const declaration = dependency.declaration;
  return {
    id: 'root',
    rootPath: '/project',
    packagePaths: ['/project'],
    manager: { state: 'selected', name: 'npm', version: '11.0.0', source: 'package-manager-field' },
    lockfile: {
      state: 'supported',
      path: '/project/package-lock.json',
      format: 'package-lock',
      version: '3',
      evidence: [],
    },
    declarations: declaration === undefined ? [] : [declaration],
    lockedPackages: [
      {
        id: dependency.packageId,
        name: dependency.name,
        version: dependency.lockedVersion,
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

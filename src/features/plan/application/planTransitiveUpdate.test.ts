import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import type { ApmPlanDigestPort, ApmPlanResolutionPort } from '../../../types/plan.js';
import type { ApmStatusDependency, ApmStatusResult } from '../../../types/status.js';
import { planAsync } from './planAsync.js';

const DIGEST: ApmPlanDigestPort = {
  digestAsync: (value) => Promise.resolve(createHash('sha256').update(value).digest('hex')),
};

test('explicit transitive updates remain lock-only and keep OTA eligibility unknown', async () => {
  const targetRequests: string[] = [];
  const plan = await planAsync(
    {
      status: transitiveStatusFixture(),
      policy: {
        dependencyUpdates: 'selected',
        selections: [
          {
            selector: {
              name: 'transitive-package',
              packageId: 'node_modules/parent/node_modules/transitive-package',
              installRootId: 'root',
            },
            target: { kind: 'version', version: '1.1.0' },
          },
        ],
      },
      executor: { apmVersion: '0.3.0', runtime: 'node', runtimeVersion: '24.0.0' },
    },
    { digest: DIGEST, resolution: transitiveResolutionPort(targetRequests) },
  );

  expect(targetRequests).toEqual(['transitive-package:transitive']);
  expect(plan.complete).toBe(true);
  expect(plan.targets[0]).toMatchObject({
    name: 'transitive-package',
    direct: false,
    targetVersion: '1.1.0',
  });
  expect(plan.files.map(({ path }) => path)).toEqual(['package-lock.json']);
  expect(plan.files.some(({ path }) => path === 'package.json')).toBe(false);
  expect(plan.effects).toContainEqual({
    kind: 'ota-eligibility',
    eligibility: 'unknown',
    evidence: [],
    reason: 'Dependency graph changes have no protocol evidence proving OTA eligibility.',
  });
});

/*** Record the transitive target and return one exact lock-only native graph update. */
function transitiveResolutionPort(calls: string[]): ApmPlanResolutionPort {
  return {
    resolveAsync: (request) => {
      const [target] = request.targets;
      if (target !== undefined)
        calls.push(`${target.name}:${target.direct ? 'direct' : 'transitive'}`);
      return Promise.resolve({
        installRootId: request.installRootId,
        complete: true,
        manager: request.manager,
        files: [
          {
            path: 'package-lock.json',
            kind: 'update',
            beforeDigest: 'transitive-v1-lock',
            afterDigest: 'transitive-v1.1-lock',
          },
        ],
        packages: [
          {
            id: 'root::node_modules/parent/node_modules/transitive-package',
            name: 'transitive-package',
            version: '1.1.0',
            direct: false,
            source: 'registry',
            dependencies: [],
          },
        ],
        artifacts: [
          {
            id: 'root::node_modules/parent/node_modules/transitive-package',
            packageName: 'transitive-package',
            version: '1.1.0',
            source: 'registry',
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
      });
    },
  };
}

/*** Build status with one direct parent and one independently identified transitive package instance. */
function transitiveStatusFixture(): ApmStatusResult {
  const parent = parentDependency();
  const transitive = transitiveDependency();
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
    installRoots: [installRootFixture(parent, transitive)],
    dependencies: [parent, transitive],
    hosts: [],
    extensions: { state: 'unavailable', complete: true, observations: [], diagnostics: [] },
    findings: [],
    diagnostics: [],
  };
}

/*** Build the direct parent dependency retaining its root declaration. */
function parentDependency(): ApmStatusDependency {
  return {
    packageId: 'node_modules/parent',
    installRootId: 'root',
    name: 'parent',
    direct: true,
    declaration: {
      ownerPath: 'package.json',
      name: 'parent',
      range: '^1.0.0',
      kind: 'dependency',
      resolvedPackageId: 'node_modules/parent',
    },
    lockedVersion: '1.0.0',
    installed: {
      packageId: 'node_modules/parent',
      state: 'present',
      source: 'node-modules',
      version: '1.0.0',
    },
    availability: {
      packageId: 'node_modules/parent',
      name: 'parent',
      state: 'known',
      latestVersion: '1.0.0',
      compatibleVersion: '1.0.0',
    },
    dependencyPaths: [['root::node_modules/parent']],
    findings: [],
  };
}

/*** Build the duplicate-safe transitive instance selected for a lock-only update. */
function transitiveDependency(): ApmStatusDependency {
  const packageId = 'node_modules/parent/node_modules/transitive-package';
  return {
    packageId,
    installRootId: 'root',
    name: 'transitive-package',
    direct: false,
    lockedVersion: '1.0.0',
    installed: { packageId, state: 'present', source: 'node-modules', version: '1.0.0' },
    availability: {
      packageId,
      name: 'transitive-package',
      state: 'known',
      latestVersion: '1.1.0',
      compatibleVersion: '1.1.0',
    },
    dependencyPaths: [['root::node_modules/parent', `root::${packageId}`]],
    findings: [],
  };
}

/*** Build the npm lock graph with the parent edge pointing at the exact transitive instance. */
function installRootFixture(
  parent: ApmStatusDependency,
  transitive: ApmStatusDependency,
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
    declarations: parent.declaration === undefined ? [] : [parent.declaration],
    lockedPackages: [
      {
        id: parent.packageId,
        name: parent.name,
        ...(parent.lockedVersion === undefined ? {} : { version: parent.lockedVersion }),
        source: 'registry',
        optional: false,
        dependencies: [
          {
            name: transitive.name,
            requested: '^1.0.0',
            packageId: transitive.packageId,
          },
        ],
      },
      {
        id: transitive.packageId,
        name: transitive.name,
        ...(transitive.lockedVersion === undefined ? {} : { version: transitive.lockedVersion }),
        source: 'registry',
        optional: false,
        dependencies: [],
      },
    ],
    installedPackages: [parent.installed, transitive.installed],
    complete: true,
    diagnostics: [],
  };
}

import { expect, test } from 'bun:test';

import type { ApmPlanPolicy } from '../../../types/plan.js';
import type {
  ApmInstallRootInventory,
  ApmStatusDependency,
  ApmStatusResult,
} from '../../../types/status.js';
import { selectDependencyTargets } from './selectDependencyTargets.js';

const SAFE_POLICY: ApmPlanPolicy = {
  dependencyUpdates: 'safe',
  selections: [],
  repairInstallations: true,
  repairProjections: true,
  maxGeneratorIterations: 4,
};

test('safe planning resolves qualified status ids through manager-native declaration identity', () => {
  const dependency = dependencyFixture('root-a');
  const result = selectDependencyTargets(
    statusFixture([dependency], [rootFixture(dependency, 'registry')]),
    SAFE_POLICY,
  );

  expect(result.blockers).toEqual([]);
  expect(result.targets).toEqual([
    {
      installRootId: 'root-a',
      packageId: 'root-a::node_modules/example-package',
      ownerPath: 'package.json',
      name: 'example-package',
      direct: true,
      kind: 'dependency',
      currentRange: '^1.0.0',
      currentVersion: '1.0.0',
      targetVersion: '1.2.0',
      targetRange: '^1.0.0',
      source: 'compatible',
      reason: 'Newest registry version satisfying ^1.0.0.',
    },
  ]);
});

test('safe planning keeps native identities scoped to their own install root', () => {
  const registryDependency = dependencyFixture('root-a');
  const fileDependency = dependencyFixture('root-b');
  const result = selectDependencyTargets(
    statusFixture(
      [registryDependency, fileDependency],
      [rootFixture(registryDependency, 'registry'), rootFixture(fileDependency, 'file')],
    ),
    SAFE_POLICY,
  );

  expect(result.blockers).toEqual([]);
  expect(
    result.targets.map(({ installRootId, packageId }) => ({ installRootId, packageId })),
  ).toEqual([
    {
      installRootId: 'root-a',
      packageId: 'root-a::node_modules/example-package',
    },
  ]);
});

/*** Build one production-shaped qualified direct dependency around a manager-native lock identity. */
function dependencyFixture(installRootId: string): ApmStatusDependency {
  const nativePackageId = 'node_modules/example-package';
  const packageId = `${installRootId}::${nativePackageId}`;
  return {
    packageId,
    installRootId,
    name: 'example-package',
    direct: true,
    declaration: {
      ownerPath: 'package.json',
      name: 'example-package',
      range: '^1.0.0',
      kind: 'dependency',
      resolvedPackageId: nativePackageId,
    },
    lockedVersion: '1.0.0',
    installed: {
      packageId: nativePackageId,
      state: 'present',
      source: 'node-modules',
      version: '1.0.0',
    },
    availability: {
      packageId,
      name: 'example-package',
      state: 'known',
      latestVersion: '2.0.0',
      compatibleVersion: '1.2.0',
    },
    dependencyPaths: [[packageId]],
    findings: [],
  };
}

/*** Build one install root whose lock package keeps the manager-native identity. */
function rootFixture(
  dependency: ApmStatusDependency,
  source: ApmInstallRootInventory['lockedPackages'][number]['source'],
): ApmInstallRootInventory {
  const nativePackageId = dependency.declaration?.resolvedPackageId;
  if (nativePackageId === undefined)
    throw new Error('Fixture requires direct resolution evidence.');
  return {
    id: dependency.installRootId,
    rootPath: `/project/${dependency.installRootId}`,
    packagePaths: [`/project/${dependency.installRootId}`],
    manager: {
      state: 'selected',
      name: 'npm',
      version: '11.19.0',
      source: 'package-manager-field',
    },
    linker: 'node-modules',
    lockfile: {
      state: 'supported',
      path: `/project/${dependency.installRootId}/package-lock.json`,
      format: 'npm-package-lock',
      version: '3',
      evidence: ['package-lock.json'],
    },
    declarations: [dependency.declaration],
    lockedPackages: [
      {
        id: nativePackageId,
        name: dependency.name,
        version: dependency.lockedVersion,
        source,
        optional: false,
        dependencies: [],
      },
    ],
    installedPackages: [dependency.installed],
    complete: true,
    diagnostics: [],
  };
}

/*** Assemble one complete status snapshot from explicit install-root evidence. */
function statusFixture(
  dependencies: readonly ApmStatusDependency[],
  installRoots: readonly ApmInstallRootInventory[],
): ApmStatusResult {
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
      packageCount: dependencies.length,
      workspaceCount: installRoots.length - 1,
    },
    installRoots,
    dependencies,
    hosts: [],
    extensions: { state: 'unavailable', complete: true, observations: [], diagnostics: [] },
    findings: [],
    diagnostics: [],
  };
}

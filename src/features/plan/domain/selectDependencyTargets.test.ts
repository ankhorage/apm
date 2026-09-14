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

const SELECTED_POLICY: ApmPlanPolicy = {
  ...SAFE_POLICY,
  dependencyUpdates: 'selected',
};

test('safe planning selects only compatible direct targets and preserves the range', () => {
  const result = selectDependencyTargets(statusFixture(), SAFE_POLICY);

  expect(result.blockers).toEqual([]);
  expect(result.targets).toHaveLength(1);
  expect(result.targets[0]).toMatchObject({
    name: 'example-package',
    direct: true,
    currentVersion: '1.0.0',
    targetVersion: '1.2.0',
    targetRange: '^1.0.0',
    source: 'compatible',
  });
});

test('explicit latest major targets use an exact range when no range policy is supplied', () => {
  const result = selectDependencyTargets(statusFixture(), {
    ...SELECTED_POLICY,
    selections: [{ selector: { name: 'example-package' }, target: { kind: 'latest' } }],
  });

  expect(result.blockers).toEqual([]);
  expect(result.targets[0]).toMatchObject({
    targetVersion: '2.0.0',
    targetRange: '2.0.0',
    source: 'latest',
  });
});

test('exact downgrades require explicit downgrade opt-in', () => {
  const result = selectDependencyTargets(statusFixture(), {
    ...SELECTED_POLICY,
    selections: [
      {
        selector: { name: 'example-package' },
        target: { kind: 'version', version: '0.9.0' },
      },
    ],
  });

  expect(result.targets).toEqual([]);
  expect(result.blockers.map(({ code }) => code)).toContain('plan.downgrade-not-allowed');
});

test('ambiguous workspace selectors block instead of choosing discovery order', () => {
  const first = dependencyFixture();
  const second = dependencyFixture({
    packageId: 'example-package@1.0.0#workspace-b',
    ownerPath: 'packages/b/package.json',
  });
  const result = selectDependencyTargets(statusFixture([first, second]), {
    ...SELECTED_POLICY,
    selections: [{ selector: { name: 'example-package' }, target: { kind: 'latest' } }],
  });

  expect(result.targets).toEqual([]);
  expect(result.blockers.map(({ code }) => code)).toContain('plan.selection-ambiguous');
});

test('explicit transitive targets remain lock-only and do not gain a direct declaration', () => {
  const direct = dependencyFixture();
  const transitive = transitiveDependencyFixture();
  const result = selectDependencyTargets(statusFixture([direct, transitive]), {
    ...SELECTED_POLICY,
    selections: [
      {
        selector: { name: 'transitive-package', packageId: transitive.packageId },
        target: { kind: 'version', version: '1.1.0' },
      },
    ],
  });

  expect(result.blockers).toEqual([]);
  expect(result.targets).toEqual([
    {
      installRootId: 'root',
      packageId: transitive.packageId,
      name: 'transitive-package',
      direct: false,
      currentVersion: '1.0.0',
      targetVersion: '1.1.0',
      source: 'exact',
      reason: 'Explicit version target selected for transitive-package.',
    },
  ]);
});

interface DependencyFixtureOptions {
  readonly packageId?: string;
  readonly ownerPath?: string;
}

/*** Build one deterministic status fixture from dependency evidence. */
function statusFixture(
  dependencies: readonly ApmStatusDependency[] = [dependencyFixture()],
): ApmStatusResult {
  return {
    schemaVersion: 2,
    operation: 'status',
    rootPath: '/project',
    complete: true,
    currency: 'outdated',
    project: projectFixture(),
    installRoots: [installRootFixture(dependencies)],
    dependencies,
    hosts: [],
    extensions: { state: 'unavailable', complete: true, observations: [], diagnostics: [] },
    findings: [],
    diagnostics: [],
  };
}

/*** Build the project summary independently of dependency fixture cardinality. */
function projectFixture(): ApmStatusResult['project'] {
  return {
    traits: [],
    languages: [],
    packageManagers: ['npm'],
    buildTools: [],
    packageCount: 1,
    workspaceCount: 0,
  };
}

/*** Build one npm install-root fixture preserving direct and transitive package identities. */
function installRootFixture(dependencies: readonly ApmStatusDependency[]): ApmInstallRootInventory {
  return {
    id: 'root',
    rootPath: '/project',
    packagePaths: ['/project'],
    manager: {
      state: 'selected',
      name: 'npm',
      version: '11.0.0',
      source: 'package-manager-field',
    },
    lockfile: {
      state: 'supported',
      path: '/project/package-lock.json',
      format: 'package-lock',
      version: '3',
      evidence: [],
    },
    declarations: dependencies.flatMap(({ declaration }) =>
      declaration === undefined ? [] : [declaration],
    ),
    lockedPackages: dependencies.map((dependency) => lockedPackageFixture(dependency)),
    installedPackages: dependencies.map(({ installed }) => installed),
    complete: true,
    diagnostics: [],
  };
}

/*** Convert status dependency evidence to the corresponding locked package fixture. */
function lockedPackageFixture(
  dependency: ApmStatusDependency,
): ApmInstallRootInventory['lockedPackages'][number] {
  return {
    id: dependency.packageId,
    name: dependency.name,
    ...(dependency.lockedVersion === undefined ? {} : { version: dependency.lockedVersion }),
    source: 'registry',
    optional: false,
    dependencies: [],
  };
}

/*** Build one direct registry dependency with compatible and major availability evidence. */
function dependencyFixture(options: DependencyFixtureOptions = {}): ApmStatusDependency {
  const packageId = options.packageId ?? 'example-package@1.0.0';
  const ownerPath = options.ownerPath ?? 'package.json';
  return {
    packageId,
    installRootId: 'root',
    name: 'example-package',
    direct: true,
    declaration: {
      ownerPath,
      name: 'example-package',
      range: '^1.0.0',
      kind: 'dependency',
      resolvedPackageId: packageId,
    },
    lockedVersion: '1.0.0',
    installed: {
      packageId,
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

/*** Build one transitive dependency instance without root declaration evidence. */
function transitiveDependencyFixture(): ApmStatusDependency {
  const packageId = 'transitive-package@1.0.0';
  return {
    packageId,
    installRootId: 'root',
    name: 'transitive-package',
    direct: false,
    lockedVersion: '1.0.0',
    installed: {
      packageId,
      state: 'present',
      source: 'node-modules',
      version: '1.0.0',
    },
    availability: {
      packageId,
      name: 'transitive-package',
      state: 'known',
      latestVersion: '1.1.0',
      compatibleVersion: '1.1.0',
    },
    dependencyPaths: [['example-package@1.0.0', packageId]],
    findings: [
      {
        code: 'transitive-update',
        scope: { kind: 'package', id: packageId },
        evidence: ['1.0.0', '1.1.0'],
        reason: 'Transitive update available.',
      },
    ],
  };
}

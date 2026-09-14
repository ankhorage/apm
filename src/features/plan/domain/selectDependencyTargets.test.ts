import { describe, expect, test } from 'bun:test';

import type { ApmPlanPolicy } from '../../../types/plan.js';
import type { ApmStatusDependency, ApmStatusResult } from '../../../types/status.js';
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

describe('selectDependencyTargets', () => {
  test('selects only the compatible target by default and preserves the declared range', () => {
    const result = selectDependencyTargets(statusFixture(), SAFE_POLICY);

    expect(result.blockers).toEqual([]);
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]).toMatchObject({
      name: 'example-package',
      currentVersion: '1.0.0',
      targetVersion: '1.2.0',
      targetRange: '^1.0.0',
      source: 'compatible',
    });
  });

  test('requires an explicit selection for a major target and does not invent a range', () => {
    const result = selectDependencyTargets(statusFixture(), {
      ...SELECTED_POLICY,
      selections: [
        {
          selector: { name: 'example-package' },
          target: { kind: 'latest' },
        },
      ],
    });

    expect(result.blockers).toEqual([]);
    expect(result.targets[0]).toMatchObject({
      targetVersion: '2.0.0',
      targetRange: '2.0.0',
      source: 'latest',
    });
  });

  test('blocks a downgrade unless the exact-version selection opts in', () => {
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
    expect(result.blockers.map((blocker) => blocker.code)).toContain('plan.downgrade-not-allowed');
  });

  test('blocks ambiguous workspace selectors instead of choosing discovery order', () => {
    const first = dependencyFixture();
    const second: ApmStatusDependency = {
      ...dependencyFixture(),
      packageId: 'example-package@1.0.0#workspace-b',
      declaration: {
        ownerPath: 'packages/b/package.json',
        name: 'example-package',
        range: '^1.0.0',
        kind: 'dependency',
        resolvedPackageId: 'example-package@1.0.0#workspace-b',
      },
    };
    const result = selectDependencyTargets(statusFixture([first, second]), {
      ...SELECTED_POLICY,
      selections: [
        {
          selector: { name: 'example-package' },
          target: { kind: 'latest' },
        },
      ],
    });

    expect(result.targets).toEqual([]);
    expect(result.blockers.map((blocker) => blocker.code)).toContain('plan.selection-ambiguous');
  });
});

/*** Build one deterministic status fixture for dependency-target policy tests. */
function statusFixture(
  dependencies: readonly ApmStatusDependency[] = [dependencyFixture()],
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
      packageCount: 1,
      workspaceCount: 0,
    },
    installRoots: [
      {
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
        declarations: dependencies.flatMap((dependency) =>
          dependency.declaration === undefined ? [] : [dependency.declaration],
        ),
        lockedPackages: dependencies.map((dependency) => ({
          id: dependency.packageId,
          name: dependency.name,
          version: dependency.lockedVersion,
          source: 'registry',
          optional: false,
          dependencies: [],
        })),
        installedPackages: dependencies.map((dependency) => dependency.installed),
        complete: true,
        diagnostics: [],
      },
    ],
    dependencies,
    hosts: [],
    extensions: { state: 'unavailable', complete: true, observations: [], diagnostics: [] },
    findings: [],
    diagnostics: [],
  };
}

/*** Build one direct registry dependency with compatible and major availability evidence. */
function dependencyFixture(): ApmStatusDependency {
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
      latestVersion: '2.0.0',
      compatibleVersion: '1.2.0',
    },
    dependencyPaths: [['example-package@1.0.0']],
    findings: [],
  };
}

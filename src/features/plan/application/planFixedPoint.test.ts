import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import type {
  ApmPlanDigestPort,
  ApmPlanPackageSelection,
  ApmPlanPorts,
  ApmPlanProtocolPort,
  ApmPlanResolutionPort,
  ApmPlanResolutionRequest,
} from '../../../types/plan.js';
import type { ApmStatusDependency, ApmStatusResult } from '../../../types/status.js';
import { planAsync } from './planAsync.js';

const DIGEST: ApmPlanDigestPort = {
  digestAsync: (value) => Promise.resolve(createHash('sha256').update(value).digest('hex')),
};

const UI_SELECTION = exactSelection('@framework/ui');
const CORE_SELECTION = exactSelection('@framework/core');
const EXTRA_SELECTION = exactSelection('@framework/extra');

test('owner-required coupled framework dependency converges through native re-resolution', async () => {
  const resolutionCalls: string[][] = [];
  const plan = await planAsync(planInput(4), {
    digest: DIGEST,
    resolution: recordingResolutionPort(resolutionCalls),
    protocol: coupledProtocolPort(),
  });

  expect(plan.complete).toBe(true);
  expect(resolutionCalls).toEqual([
    ['@framework/ui'],
    ['@framework/core', '@framework/ui'],
  ]);
  expect(plan.targets.map(({ name }) => name)).toEqual(['@framework/core', '@framework/ui']);
  expect(plan.blockers).toEqual([]);
});

test('nonconvergent owner dependency policy blocks and withholds intermediate executable diffs', async () => {
  const plan = await planAsync(planInput(2), {
    digest: DIGEST,
    resolution: recordingResolutionPort([]),
    protocol: nonconvergentProtocolPort(),
  });

  expect(plan.complete).toBe(false);
  expect(plan.blockers.map(({ code }) => code)).toContain('plan.generator-nonconvergent');
  expect(plan.files).toEqual([]);
  expect(plan.packages).toEqual([]);
  expect(plan.artifacts).toEqual([]);
  expect(plan.steps).toEqual([]);
});

/*** Build explicit selected-mode input so owner requirements, not safe updates, drive the fixed point. */
function planInput(maxGeneratorIterations: number) {
  return {
    status: statusFixture(),
    policy: {
      dependencyUpdates: 'selected' as const,
      selections: [UI_SELECTION],
      maxGeneratorIterations,
    },
    executor: { apmVersion: '0.3.0', runtime: 'node' as const, runtimeVersion: '24.0.0' },
  };
}

/*** Record each native resolution target set and return deterministic reviewed lock evidence. */
function recordingResolutionPort(calls: string[][]): ApmPlanResolutionPort {
  return {
    resolveAsync: (request) => {
      calls.push(request.targets.map(({ name }) => name).sort());
      return Promise.resolve(resolutionResult(request));
    },
  };
}

/*** Require the coupled core package until it is visible in the resolved target graph. */
function coupledProtocolPort(): ApmPlanProtocolPort {
  return {
    planProtocolAsync: ({ targets }) =>
      Promise.resolve(protocolResult(targets.some(({ name }) => name === '@framework/core')
        ? []
        : [CORE_SELECTION])),
  };
}

/*** Require another package on each bounded pass so the second iteration proves non-convergence. */
function nonconvergentProtocolPort(): ApmPlanProtocolPort {
  return {
    planProtocolAsync: ({ targets }) => {
      const names = new Set(targets.map(({ name }) => name));
      const required = !names.has('@framework/core')
        ? [CORE_SELECTION]
        : !names.has('@framework/extra')
          ? [EXTRA_SELECTION]
          : [];
      return Promise.resolve(protocolResult(required));
    },
  };
}

/*** Build one protocol response with dependency requirements but no hidden project mutation. */
function protocolResult(requiredSelections: readonly ApmPlanPackageSelection[]) {
  return {
    complete: true,
    requiredSelections,
    files: [],
    artifacts: [],
    steps: [],
    effects: [],
    findings: [],
    blockers: [],
    diagnostics: [],
  };
}

/*** Convert native target requests into exact package/artifact evidence and a staged lock diff. */
function resolutionResult(request: ApmPlanResolutionRequest) {
  const packages = request.targets.map(({ name, targetVersion }) => ({
    id: `${name}@${targetVersion}`,
    name,
    version: targetVersion,
    direct: true,
    source: 'registry' as const,
    dependencies: [],
  }));
  return {
    installRootId: request.installRootId,
    complete: true,
    manager: request.manager,
    files: [
      {
        path: 'package-lock.json',
        kind: 'update' as const,
        beforeDigest: 'before',
        afterDigest: request.targets.map(({ name }) => name).sort().join('+'),
      },
    ],
    packages,
    artifacts: packages.map(({ id, name, version, source }) => ({
      id,
      packageName: name,
      version,
      source,
    })),
    effects: {
      projectWrites: false as const,
      lifecycleScripts: false as const,
      network: 'allowed' as const,
      cache: 'manager-default' as const,
    },
    blockers: [],
    diagnostics: [],
  };
}

/*** Build one exact package selection that intentionally crosses the current declared major range. */
function exactSelection(name: string): ApmPlanPackageSelection {
  return {
    selector: { name, installRootId: 'root', ownerPath: 'package.json' },
    target: { kind: 'version', version: '2.0.0', manifestRange: '^2.0.0' },
  };
}

/*** Build a complete status snapshot containing all packages an owner may couple into the plan. */
function statusFixture(): ApmStatusResult {
  const dependencies = [
    dependencyFixture('@framework/ui'),
    dependencyFixture('@framework/core'),
    dependencyFixture('@framework/extra'),
  ];
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
    installRoots: [installRootFixture(dependencies)],
    dependencies,
    hosts: [],
    extensions: { state: 'available', complete: true, observations: [], diagnostics: [] },
    findings: [],
    diagnostics: [],
  };
}

/*** Build one direct registry dependency whose explicit v2 target is available. */
function dependencyFixture(name: string): ApmStatusDependency {
  const packageId = `${name}@1.0.0`;
  return {
    packageId,
    installRootId: 'root',
    name,
    direct: true,
    declaration: {
      ownerPath: 'package.json',
      name,
      range: '^1.0.0',
      kind: 'dependency',
      resolvedPackageId: packageId,
    },
    lockedVersion: '1.0.0',
    installed: { packageId, state: 'present', source: 'node-modules', version: '1.0.0' },
    availability: {
      packageId,
      name,
      state: 'known',
      latestVersion: '2.0.0',
      compatibleVersion: '1.0.0',
    },
    dependencyPaths: [[packageId]],
    findings: [],
  };
}

/*** Build one selected npm install root for fixed-point dependency resolution. */
function installRootFixture(
  dependencies: readonly ApmStatusDependency[],
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
    declarations: dependencies.flatMap(({ declaration }) => declaration === undefined ? [] : [declaration]),
    lockedPackages: dependencies.map(({ packageId, name, lockedVersion }) => ({
      id: packageId,
      name,
      ...(lockedVersion === undefined ? {} : { version: lockedVersion }),
      source: 'registry' as const,
      optional: false,
      dependencies: [],
    })),
    installedPackages: dependencies.map(({ installed }) => installed),
    complete: true,
    diagnostics: [],
  };
}

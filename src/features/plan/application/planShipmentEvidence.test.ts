import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import type {
  ApmPlanDigestPort,
  ApmPlanProtocolPort,
  ApmPlanResolutionPort,
  ApmPlanResolutionRequest,
  ApmPlanResolutionResult,
} from '../../../types/plan.js';
import type { ApmStatusDependency, ApmStatusResult } from '../../../types/status.js';
import type { ApmReleaseEffect } from '../../../types/update-protocol.js';
import { planAsync } from './planAsync.js';

const DIGEST: ApmPlanDigestPort = {
  digestAsync: (value) => Promise.resolve(createHash('sha256').update(value).digest('hex')),
};

const EXECUTOR = { apmVersion: '0.8.4', runtime: 'node' as const, runtimeVersion: '24.0.0' };

test('source updates stay separate from web/native shipment work and missing OTA evidence stays unknown', async () => {
  const plan = await planAsync(planInput(), {
    digest: DIGEST,
    resolution: resolutionPort(),
    protocol: protocolPort([
      releaseRequirement('web-rebuild', 'Web source changed and must be rebuilt.'),
      releaseRequirement('web-redeploy', 'The rebuilt web artifact must be redeployed.'),
      releaseRequirement('native-binary', 'Native dependency impact requires a new store binary.'),
    ]),
  });

  expect(plan.complete).toBe(true);
  expect(plan.files.map(({ path }) => path).sort()).toEqual(['package-lock.json', 'package.json']);
  expect(plan.targets[0]).toMatchObject({
    name: '@fixture/runtime',
    currentRange: '^1.0.0',
    targetRange: '^2.0.0',
    targetVersion: '2.0.0',
  });
  expect(plan.effects).toContainEqual(
    releaseRequirement('web-rebuild', 'Web source changed and must be rebuilt.'),
  );
  expect(plan.effects).toContainEqual(
    releaseRequirement('web-redeploy', 'The rebuilt web artifact must be redeployed.'),
  );
  expect(plan.effects).toContainEqual(
    releaseRequirement('native-binary', 'Native dependency impact requires a new store binary.'),
  );
  expect(plan.effects).toContainEqual({
    kind: 'ota-eligibility',
    eligibility: 'unknown',
    evidence: [],
    reason: 'Dependency graph changes have no protocol evidence proving OTA eligibility.',
  });
  expect(plan.steps.filter(({ kind }) => kind === 'follow-up')).toHaveLength(4);
});

test('explicit owner/platform evidence preserves a reviewed OTA eligibility claim', async () => {
  const otaEffect: ApmReleaseEffect = {
    kind: 'ota-eligibility',
    eligibility: 'eligible',
    evidence: ['owner:@fixture/runtime@2.0.0', 'platform:expo-updates:runtime-policy-v1'],
    reason: 'The owner platform policy proves this source-only update is OTA compatible.',
  };
  const plan = await planAsync(planInput(), {
    digest: DIGEST,
    resolution: resolutionPort(),
    protocol: protocolPort([otaEffect]),
  });

  expect(plan.complete).toBe(true);
  expect(plan.effects).toEqual([otaEffect]);
  expect(plan.effects).not.toContainEqual({
    kind: 'ota-eligibility',
    eligibility: 'unknown',
    evidence: [],
    reason: 'Dependency graph changes have no protocol evidence proving OTA eligibility.',
  });
});

/*** Build one selected dependency-range update used by shipment evidence tests. */
function planInput() {
  return {
    status: statusFixture(),
    policy: {
      dependencyUpdates: 'selected' as const,
      selections: [
        {
          selector: {
            name: '@fixture/runtime',
            installRootId: 'root',
            ownerPath: 'package.json',
          },
          target: { kind: 'version' as const, version: '2.0.0', manifestRange: '^2.0.0' },
        },
      ],
    },
    executor: EXECUTOR,
  };
}

/*** Return deterministic source and lock changes for the reviewed dependency target. */
function resolutionPort(): ApmPlanResolutionPort {
  return { resolveAsync: (request) => Promise.resolve(resolutionResult(request)) };
}

/*** Build exact reviewed package-manager resolution evidence for the selected runtime update. */
function resolutionResult(request: ApmPlanResolutionRequest): ApmPlanResolutionResult {
  return {
    installRootId: request.installRootId,
    installRootPath: request.installRootPath,
    complete: true,
    manager: request.manager,
    files: [
      {
        path: 'package.json',
        kind: 'update',
        beforeDigest: 'manifest-v1',
        afterDigest: 'manifest-v2',
        beforeContent: '{"dependencies":{"@fixture/runtime":"^1.0.0"}}',
        afterContent: '{"dependencies":{"@fixture/runtime":"^2.0.0"}}',
      },
      {
        path: 'package-lock.json',
        kind: 'update',
        beforeDigest: 'lock-v1',
        afterDigest: 'lock-v2',
      },
    ],
    packages: [resolvedPackage()],
    artifacts: [resolvedArtifact()],
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

/*** Build the exact resolved runtime package. */
function resolvedPackage(): ApmPlanResolutionResult['packages'][number] {
  return {
    id: 'root::node_modules/@fixture/runtime',
    name: '@fixture/runtime',
    version: '2.0.0',
    direct: true,
    source: 'registry',
    dependencies: [],
  };
}

/*** Build the immutable target artifact identity. */
function resolvedArtifact(): ApmPlanResolutionResult['artifacts'][number] {
  return {
    id: 'root::node_modules/@fixture/runtime',
    packageName: '@fixture/runtime',
    version: '2.0.0',
    source: 'registry',
    integrity: 'sha512-runtime-v2',
  };
}

/*** Expose package-owned release effects without adding migration or projection work. */
function protocolPort(effects: readonly ApmReleaseEffect[]): ApmPlanProtocolPort {
  return {
    planProtocolAsync: () =>
      Promise.resolve({
        complete: true,
        requiredSelections: [],
        files: [],
        artifacts: [],
        steps: [],
        effects,
        findings: [],
        blockers: [],
        diagnostics: [],
      }),
  };
}

/*** Build one required shipment effect with explicit owner/platform evidence. */
function releaseRequirement(
  kind: 'web-rebuild' | 'web-redeploy' | 'native-binary',
  reason: string,
): ApmReleaseEffect {
  return {
    kind,
    requirement: 'required',
    evidence: ['owner:@fixture/runtime@2.0.0', `target:${kind}`],
    reason,
  };
}

/*** Build complete dependency evidence for an installed v1 runtime and available v2 release. */
function statusFixture(): ApmStatusResult {
  const dependency = dependencyFixture();
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
    installRoots: [installRootFixture(dependency)],
    dependencies: [dependency],
    hosts: [],
    extensions: { state: 'available', complete: true, observations: [], diagnostics: [] },
    findings: [],
    diagnostics: [],
  };
}

/*** Build the selected npm install root containing the runtime dependency. */
function installRootFixture(
  dependency: ApmStatusDependency,
): ApmStatusResult['installRoots'][number] {
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
      format: 'npm-package-lock',
      version: '3',
      evidence: ['package-lock.json'],
    },
    declarations: dependency.declaration === undefined ? [] : [dependency.declaration],
    lockedPackages: [lockedPackageFixture(dependency)],
    installedPackages: [dependency.installed],
    complete: true,
    diagnostics: [],
  };
}

/*** Build the locked v1 runtime package evidence. */
function lockedPackageFixture(
  dependency: ApmStatusDependency,
): ApmStatusResult['installRoots'][number]['lockedPackages'][number] {
  return {
    id: dependency.packageId,
    name: dependency.name,
    version: '1.0.0',
    source: 'registry',
    optional: false,
    dependencies: [],
  };
}

/*** Build the direct dependency whose declaration and source graph are updated by the plan. */
function dependencyFixture(): ApmStatusDependency {
  const packageId = 'node_modules/@fixture/runtime';
  return {
    packageId,
    installRootId: 'root',
    name: '@fixture/runtime',
    direct: true,
    declaration: {
      ownerPath: 'package.json',
      name: '@fixture/runtime',
      range: '^1.0.0',
      kind: 'dependency',
      resolvedPackageId: packageId,
    },
    lockedVersion: '1.0.0',
    installed: { packageId, state: 'present', source: 'node-modules', version: '1.0.0' },
    availability: {
      packageId,
      name: '@fixture/runtime',
      state: 'known',
      latestVersion: '2.0.0',
      compatibleVersion: '1.0.0',
    },
    dependencyPaths: [[`root::${packageId}`]],
    findings: [],
  };
}

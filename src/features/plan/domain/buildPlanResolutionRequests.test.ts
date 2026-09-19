import { expect, test } from 'bun:test';

import type { ApmPlanPolicy } from '../../../types/plan.js';
import type { ApmStatusDependency, ApmStatusResult } from '../../../types/status.js';
import { buildPlanResolutionRequests } from './buildPlanResolutionRequests.js';

const POLICY: ApmPlanPolicy = {
  dependencyUpdates: 'safe',
  selections: [],
  repairInstallations: true,
  repairProjections: true,
  maxGeneratorIterations: 4,
};

test('does not repair an absent optional transitive without an install-absent finding', () => {
  const status = statusFixture(optionalTransitiveDependency());

  const result = buildPlanResolutionRequests(status, POLICY, []);

  expect(result.requests).toEqual([]);
  expect(result.blockers).toEqual([]);
});

test('repairs a required absent package when status reports install-absent', () => {
  const status = statusFixture(requiredAbsentDependency());

  const result = buildPlanResolutionRequests(status, POLICY, []);

  expect(result.requests).toHaveLength(1);
  expect(result.requests[0]).toMatchObject({
    installRootId: '.',
    installRootPath: '/project',
    manager: 'bun',
    targets: [],
  });
  expect(result.blockers).toEqual([]);
});

function statusFixture(dependency: ApmStatusDependency): ApmStatusResult {
  return {
    schemaVersion: 2,
    operation: 'status',
    rootPath: '/project',
    complete: true,
    currency: 'outdated',
    project: {
      traits: ['javascript'],
      languages: [],
      packageManagers: ['bun'],
      buildTools: [],
      packageCount: 1,
      workspaceCount: 0,
    },
    installRoots: [
      {
        id: '.',
        rootPath: '/project',
        packagePaths: ['/project'],
        manager: {
          state: 'selected',
          name: 'bun',
          version: '1.4.2',
          source: 'package-manager-field',
        },
        linker: 'isolated',
        lockfile: {
          state: 'supported',
          path: '/project/bun.lock',
          format: 'bun-text-lock',
          version: '2',
          evidence: ['bun.lock'],
        },
        declarations: [],
        lockedPackages: [],
        installedPackages: [dependency.installed],
        complete: true,
        diagnostics: [],
      },
    ],
    dependencies: [dependency],
    hosts: [],
    extensions: { state: 'unavailable', complete: true, observations: [], diagnostics: [] },
    findings: dependency.findings,
    diagnostics: [],
  };
}

function optionalTransitiveDependency(): ApmStatusDependency {
  return {
    packageId: '.::bun:optional-transitive',
    installRootId: '.',
    name: 'optional-transitive',
    direct: false,
    lockedVersion: '1.0.0',
    installed: {
      packageId: 'bun:optional-transitive',
      state: 'absent',
      source: 'bun-store',
      reason: 'Optional platform package is not installed on this host.',
    },
    availability: {
      packageId: '.::bun:optional-transitive',
      name: 'optional-transitive',
      state: 'known',
      latestVersion: '1.0.0',
      compatibleVersion: '1.0.0',
    },
    dependencyPaths: [['.::bun:parent', '.::bun:optional-transitive']],
    findings: [],
  };
}

function requiredAbsentDependency(): ApmStatusDependency {
  const packageId = '.::bun:required-package';
  return {
    packageId,
    installRootId: '.',
    name: 'required-package',
    direct: true,
    declaration: {
      ownerPath: 'package.json',
      name: 'required-package',
      range: '^1.0.0',
      kind: 'dependency',
      resolvedPackageId: 'bun:required-package',
    },
    lockedVersion: '1.0.0',
    installed: {
      packageId: 'bun:required-package',
      state: 'absent',
      source: 'bun-store',
      reason: 'Required package is missing.',
    },
    availability: {
      packageId,
      name: 'required-package',
      state: 'known',
      latestVersion: '1.0.0',
      compatibleVersion: '1.0.0',
    },
    dependencyPaths: [[packageId]],
    findings: [
      {
        code: 'install-absent',
        scope: { kind: 'package', id: packageId },
        evidence: ['Required package is missing.'],
        reason: 'The locked package instance is not installed at the inspected project state.',
        nextAction: 'Install dependencies with the selected package manager before verification.',
      },
    ],
  };
}

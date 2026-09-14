import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import type { ApmPlanDigestPort, ApmPlanProtocolPort } from '../../../types/plan.js';
import type { ApmStatusResult } from '../../../types/status.js';
import { planAsync } from './planAsync.js';

const DIGEST: ApmPlanDigestPort = {
  digestAsync: (value) => Promise.resolve(createHash('sha256').update(value).digest('hex')),
};

test('required host upgrade blocks app diffs and explains the restart and re-plan boundary', async () => {
  const plan = await planAsync(
    {
      status: hostStatusFixture(),
      policy: { dependencyUpdates: 'none' },
      executor: { apmVersion: '0.3.0', runtime: 'node', runtimeVersion: '24.0.0' },
    },
    {
      digest: DIGEST,
      resolution: {
        resolveAsync: () => {
          throw new Error('host prerequisite must block before native dependency resolution');
        },
      },
      protocol: hostPrerequisiteProtocolPort(),
    },
  );

  expect(plan.complete).toBe(false);
  expect(plan.targets).toEqual([]);
  expect(plan.files).toEqual([]);
  expect(plan.steps).toEqual([]);
  expect(plan.blockers).toContainEqual({
    code: 'plan.host-upgrade-required',
    scope: { kind: 'host', id: 'apm' },
    evidence: ['0.3.0', '0.4.0'],
    reason: 'Selected package-owned update metadata requires a newer APM host.',
    nextAction: 'Upgrade APM to 0.4.0, restart the host, then create a new plan.',
  });
});

/*** Represent package-owned compatibility evidence that requires a host restart before project planning. */
function hostPrerequisiteProtocolPort(): ApmPlanProtocolPort {
  return {
    planProtocolAsync: () =>
      Promise.resolve({
        complete: false,
        requiredSelections: [],
        files: [],
        artifacts: [],
        steps: [],
        effects: [],
        findings: [],
        blockers: [
          {
            code: 'plan.host-upgrade-required',
            scope: { kind: 'host', id: 'apm' },
            evidence: ['0.3.0', '0.4.0'],
            reason: 'Selected package-owned update metadata requires a newer APM host.',
            nextAction: 'Upgrade APM to 0.4.0, restart the host, then create a new plan.',
          },
        ],
        diagnostics: [],
      }),
  };
}

/*** Keep host availability separate from app dependency targets in the planning snapshot. */
function hostStatusFixture(): ApmStatusResult {
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
    installRoots: [],
    dependencies: [],
    hosts: [hostPackageFixture()],
    extensions: { state: 'available', complete: true, observations: [], diagnostics: [] },
    findings: [hostUpdateFindingFixture()],
    diagnostics: [],
  };
}

/*** Build host availability evidence independently from project dependency targets. */
function hostPackageFixture(): ApmStatusResult['hosts'][number] {
  return {
    id: 'apm',
    name: '@ankhorage/apm',
    version: '0.3.0',
    availability: {
      packageId: 'apm',
      name: '@ankhorage/apm',
      state: 'known',
      latestVersion: '0.4.0',
      compatibleVersion: '0.4.0',
    },
    findings: [hostUpdateFindingFixture()],
  };
}

/*** Build the host update finding shared by aggregate and per-host status evidence. */
function hostUpdateFindingFixture(): ApmStatusResult['findings'][number] {
  return {
    code: 'host-update',
    scope: { kind: 'host', id: 'apm' },
    evidence: ['0.3.0', '0.4.0'],
    reason: 'A newer APM host is available.',
  };
}

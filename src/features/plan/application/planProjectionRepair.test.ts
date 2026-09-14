import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import type { ApmPlanDigestPort, ApmPlanProtocolPort } from '../../../types/plan.js';
import type { ApmStatusResult } from '../../../types/status.js';
import { planAsync } from './planAsync.js';

const DIGEST: ApmPlanDigestPort = {
  digestAsync: (value) => Promise.resolve(createHash('sha256').update(value).digest('hex')),
};

test('projection drift yields a projection-only reviewed repair without dependency resolution', async () => {
  const resolutionCalls: string[] = [];
  const plan = await planAsync(
    {
      status: projectionStatusFixture(),
      policy: { dependencyUpdates: 'none' },
      executor: { apmVersion: '0.3.0', runtime: 'node', runtimeVersion: '24.0.0' },
    },
    {
      digest: DIGEST,
      resolution: {
        resolveAsync: (request) => {
          resolutionCalls.push(request.installRootId);
          throw new Error('projection-only plan must not resolve dependencies');
        },
      },
      protocol: projectionProtocolPort(),
    },
  );

  expect(resolutionCalls).toEqual([]);
  expect(plan.complete).toBe(true);
  expect(plan.targets).toEqual([]);
  expect(plan.files.map(({ path }) => path)).toEqual(['generated.json']);
  expect(plan.steps.map(({ id }) => id)).toEqual([
    'projection:@owner/package:generated',
    'validation:project',
  ]);
});

/*** Plan one stale generated projection without requiring package dependency changes. */
function projectionProtocolPort(): ApmPlanProtocolPort {
  return {
    planProtocolAsync: () =>
      Promise.resolve({
        complete: true,
        requiredSelections: [],
        files: [
          {
            path: 'generated.json',
            kind: 'update',
            beforeDigest: 'old-generator-output',
            afterDigest: 'new-generator-output',
            beforeContent: '{"version":1}',
            afterContent: '{"version":2}',
          },
        ],
        artifacts: [],
        steps: [
          {
            id: 'projection:@owner/package:generated',
            kind: 'projection',
            prerequisites: [],
            owner: '@owner/package',
            reason: 'Generator fingerprint changed and the owned projection is stale.',
            evidence: ['generator:v2'],
          },
        ],
        effects: [],
        findings: [],
        blockers: [],
        diagnostics: [],
      }),
  };
}

/*** Build complete status evidence whose only drift is a stale package-owned projection. */
function projectionStatusFixture(): ApmStatusResult {
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
    hosts: [],
    extensions: {
      state: 'available',
      complete: true,
      observations: [
        {
          owner: '@owner/package',
          projection: 'stale',
          migration: 'current',
          evidence: ['generated.json'],
        },
      ],
      diagnostics: [],
    },
    findings: [
      {
        code: 'projection-stale',
        scope: { kind: 'projection', id: 'generated' },
        evidence: ['generated.json'],
        reason: 'Projection generator fingerprint changed.',
      },
    ],
    diagnostics: [],
  };
}

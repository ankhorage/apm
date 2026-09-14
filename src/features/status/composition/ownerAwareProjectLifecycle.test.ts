import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import type { ApmStatusInput, ApmStatusResult } from '../../../types/status.js';
import type { ApmProjectStatusPort } from '../../../types/status-project.js';
import { applyProjectAsync } from '../../apply/composition/applyProjectAsync.js';
import { planProjectAsync } from '../../plan/composition/planProjectAsync.js';
import { verifyProjectAsync } from '../../verify/composition/verifyProjectAsync.js';

const PERMISSIONS = {
  ownerCode: false,
  lifecycleScripts: false,
  externalEffects: false,
} as const;

test('reuses identical owner-aware status evidence for plan apply validation and verify', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-owner-status-'));
  const calls: ApmStatusInput[] = [];
  const status: ApmProjectStatusPort = {
    inspectStatusAsync: (input) => {
      calls.push(input);
      return Promise.resolve(statusFixture(rootPath));
    },
  };

  try {
    const plan = await planProjectAsync({ rootPath }, { status });
    const apply = await applyProjectAsync(
      { mode: 'start', plan, permissions: PERMISSIONS },
      { status },
    );
    const verify = await verifyProjectAsync(
      { rootPath, operationId: apply.operationId },
      { status },
    );

    expect(plan.complete).toBe(true);
    expect(apply.status).toBe('completed');
    expect(verify.verified).toBe(true);
    expect(calls.map(({ availability }) => availability)).toEqual([
      'refresh',
      'refresh',
      'refresh',
    ]);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

/*** Build complete owner-aware status whose extension evidence participates in the saved-plan fingerprint. */
function statusFixture(rootPath: string): ApmStatusResult {
  return {
    schemaVersion: 2,
    operation: 'status',
    rootPath,
    complete: true,
    currency: 'current',
    project: {
      traits: [],
      languages: [],
      packageManagers: [],
      buildTools: [],
      packageCount: 0,
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
          projection: 'current',
          migration: 'current',
          evidence: ['owner-projection:current'],
        },
      ],
      diagnostics: [],
    },
    findings: [],
    diagnostics: [],
  };
}

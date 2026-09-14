import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import type { ApmApplyJournal, ApmApplyPorts } from '../../../types/apply.js';
import type { ApmPlanResult } from '../../../types/plan.js';
import type { ApmStatusResult } from '../../../types/status.js';
import { createSha256PlanDigestPort } from '../../plan/adapters/outbound/createSha256PlanDigestPort.js';
import { createNodeApplyStepPort } from '../adapters/outbound/createNodeApplyStepPort.js';
import { createApplyJournal } from '../domain/createApplyJournal.js';
import { runApplyStepsAsync } from './runApplyStepsAsync.js';

const EXECUTOR = { apmVersion: '0.4.0', runtime: 'node' as const, runtimeVersion: '24.0.0' };
const PERMISSIONS = { ownerCode: false, lifecycleScripts: false, externalEffects: false } as const;

test('failed required validation produces a durable failed operation', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-validation-failure-'));
  try {
    const plan = validationPlan(rootPath);
    const state = {
      journal: createApplyJournal(
        plan,
        PERMISSIONS,
        'validation-failure',
        '2026-09-14T21:00:00.000Z',
      ),
    };
    const outcome = await runApplyStepsAsync(state.journal, applyPorts(state));

    expect(outcome.status).toBe('failed');
    expect(outcome.journal.status).toBe('failed');
    expect(outcome.journal.failure?.code).toBe('apply.validation-failed');
    expect(outcome.journal.steps[0]).toMatchObject({ state: 'failed', attempts: 1 });
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

interface ValidationState {
  journal: ApmApplyJournal;
}

/*** Compose real Node step execution with in-memory operation persistence for validation behavior. */
function applyPorts(state: ValidationState): ApmApplyPorts {
  return {
    clock: { nowIso: () => '2026-09-14T21:00:01.000Z' },
    operationId: { createOperationId: () => 'unused' },
    lock: {
      acquireAsync: () => Promise.resolve({ state: 'acquired', lock: lockIdentity() }),
      recoverStaleAsync: () => Promise.resolve({ state: 'acquired', lock: lockIdentity() }),
      releaseAsync: () => Promise.resolve(),
    },
    journal: {
      createAsync: (journal) => {
        state.journal = journal;
        return Promise.resolve();
      },
      readAsync: () => Promise.resolve(state.journal),
      writeAsync: (journal) => {
        state.journal = journal;
        return Promise.resolve();
      },
    },
    status: { inspectStatusAsync: (rootPath) => Promise.resolve(statusFixture(rootPath)) },
    planValidation: { validateAsync: () => Promise.resolve([]) },
    executor: { current: () => EXECUTOR },
    step: createNodeApplyStepPort({ digest: createSha256PlanDigestPort() }),
  };
}

/*** Build one required validation command that deterministically fails without shell execution. */
function validationPlan(rootPath: string): ApmPlanResult {
  return {
    schemaVersion: 2,
    operation: 'plan',
    id: 'validation-failure-plan',
    rootPath,
    complete: true,
    policy: {
      dependencyUpdates: 'none',
      selections: [],
      repairInstallations: true,
      repairProjections: true,
      maxGeneratorIterations: 4,
    },
    executor: EXECUTOR,
    inputFingerprint: { value: 'fixture', statusSchemaVersion: 2, availabilityCheckedAt: [] },
    targets: [],
    files: [],
    packages: [],
    artifacts: [],
    steps: [
      {
        id: 'validation:project',
        kind: 'validation',
        prerequisites: [],
        reason: 'Fail the required app validation.',
        evidence: [],
        execution: {
          kind: 'validation',
          checks: [
            {
              id: 'failing-check',
              kind: 'command',
              executable: process.execPath,
              args: ['--eval', 'process.exit(7)'],
            },
          ],
        },
      },
    ],
    effects: [],
    findings: [],
    blockers: [],
    diagnostics: [],
  };
}

/*** Build complete neutral status evidence for unused apply port requirements. */
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
    extensions: { state: 'unavailable', complete: true, observations: [], diagnostics: [] },
    findings: [],
    diagnostics: [],
  };
}

/*** Build a lock identity for unused in-memory lock methods. */
function lockIdentity() {
  return {
    schemaVersion: 1 as const,
    operationId: 'validation-failure',
    planId: 'validation-failure-plan',
    pid: 1,
    hostname: 'fixture',
    acquiredAt: '2026-09-14T21:00:00.000Z',
  };
}

import { expect, test } from 'bun:test';

import type {
  ApmApplyJournal,
  ApmApplyLockAcquireResult,
  ApmApplyPorts,
  ApmApplyStepExecutionResult,
  ApmApplyStepObservation,
} from '../../../types/apply.js';
import type { ApmPlanResult, ApmPlanStep } from '../../../types/plan.js';
import type { ApmStatusResult } from '../../../types/status.js';
import { createApplyJournal } from '../domain/createApplyJournal.js';
import { applyAsync } from './applyAsync.js';

const PERMISSIONS = { ownerCode: false, lifecycleScripts: false, externalEffects: false } as const;
const EXECUTOR = { apmVersion: '0.4.0', runtime: 'node' as const, runtimeVersion: '24.0.0' };

test('stale plan blocks before creating a journal or executing project effects', async () => {
  const fixture = portsFixture();
  fixture.state.planValidationBlockers = [
    {
      code: 'plan.input-changed',
      scope: { kind: 'project' },
      evidence: ['old', 'new'],
      reason: 'Planning evidence changed.',
    },
  ];

  const result = await applyAsync(
    { mode: 'start', plan: planFixture(), permissions: PERMISSIONS },
    fixture.ports,
  );

  expect(result.status).toBe('blocked');
  expect(result.blockers.map(({ code }) => code)).toEqual(['apply.plan-stale']);
  expect(fixture.state.createdJournals).toBe(0);
  expect(fixture.state.executeCalls).toBe(0);
});

test('concurrent apply is rejected by the exclusive operation lock', async () => {
  const fixture = portsFixture();
  fixture.state.lockResult = {
    state: 'conflict',
    lock: lockIdentity('existing-op'),
    reason: 'Another live APM operation owns this project.',
  };

  const result = await applyAsync(
    { mode: 'start', plan: planFixture(), permissions: PERMISSIONS },
    fixture.ports,
  );

  expect(result.status).toBe('blocked');
  expect(result.blockers.map(({ code }) => code)).toEqual(['apply.lock-conflict']);
  expect(fixture.state.createdJournals).toBe(0);
  expect(fixture.state.executeCalls).toBe(0);
});

test('duplicate resume of a completed operation is idempotent and does not acquire or execute again', async () => {
  const fixture = portsFixture();
  const journal = completedJournalFixture();
  fixture.state.journal = journal;

  const result = await applyAsync(
    {
      mode: 'resume',
      rootPath: journal.rootPath,
      operationId: journal.operationId,
      permissions: PERMISSIONS,
    },
    fixture.ports,
  );

  expect(result.status).toBe('completed');
  expect(result.complete).toBe(true);
  expect(fixture.state.lockCalls).toBe(0);
  expect(fixture.state.executeCalls).toBe(0);
});

test('lost process resumes an already satisfied started effect without repeating execution', async () => {
  const fixture = portsFixture();
  const journal = startedJournalFixture();
  fixture.state.journal = journal;
  fixture.state.lockResult = {
    state: 'stale',
    lock: lockIdentity(journal.operationId, journal.plan.id),
    reason: 'Recorded process no longer exists on this host.',
  };
  fixture.state.recoveredLockResult = {
    state: 'acquired',
    lock: lockIdentity(journal.operationId, journal.plan.id),
  };
  fixture.state.observation = { state: 'satisfied', evidence: ['digest:after'] };

  const result = await applyAsync(
    {
      mode: 'resume',
      rootPath: journal.rootPath,
      operationId: journal.operationId,
      permissions: PERMISSIONS,
    },
    fixture.ports,
  );

  expect(result.status).toBe('completed');
  expect(fixture.state.recoverCalls).toBe(1);
  expect(fixture.state.executeCalls).toBe(0);
  expect(result.journal?.steps[0]).toMatchObject({ state: 'committed', attempts: 1 });
});

interface ApplyFixtureState {
  journal?: ApmApplyJournal;
  planValidationBlockers: Awaited<ReturnType<ApmApplyPorts['planValidation']['validateAsync']>>;
  lockResult: ApmApplyLockAcquireResult;
  recoveredLockResult: ApmApplyLockAcquireResult;
  observation: ApmApplyStepObservation;
  execution: ApmApplyStepExecutionResult;
  createdJournals: number;
  lockCalls: number;
  recoverCalls: number;
  executeCalls: number;
}

/*** Build in-memory apply ports that expose all externally observable state-machine interactions. */
function portsFixture(): { readonly ports: ApmApplyPorts; readonly state: ApplyFixtureState } {
  const state: ApplyFixtureState = {
    planValidationBlockers: [],
    lockResult: { state: 'acquired', lock: lockIdentity('op-1') },
    recoveredLockResult: { state: 'acquired', lock: lockIdentity('op-1') },
    observation: { state: 'pending', evidence: [] },
    execution: { state: 'completed', evidence: ['executed'], diagnostics: [] },
    createdJournals: 0,
    lockCalls: 0,
    recoverCalls: 0,
    executeCalls: 0,
  };
  const ports: ApmApplyPorts = {
    clock: { nowIso: () => '2026-09-14T20:00:00.000Z' },
    operationId: { createOperationId: () => 'op-1' },
    lock: {
      acquireAsync: () => {
        state.lockCalls += 1;
        return Promise.resolve(state.lockResult);
      },
      recoverStaleAsync: () => {
        state.recoverCalls += 1;
        return Promise.resolve(state.recoveredLockResult);
      },
      releaseAsync: () => Promise.resolve(),
    },
    journal: {
      createAsync: (journal) => {
        state.createdJournals += 1;
        state.journal = journal;
        return Promise.resolve();
      },
      readAsync: () => Promise.resolve(state.journal),
      writeAsync: (journal) => {
        state.journal = journal;
        return Promise.resolve();
      },
    },
    status: { inspectStatusAsync: () => Promise.resolve(statusFixture()) },
    planValidation: { validateAsync: () => Promise.resolve(state.planValidationBlockers) },
    executor: { current: () => EXECUTOR },
    step: {
      observeAsync: () => Promise.resolve(state.observation),
      executeAsync: () => {
        state.executeCalls += 1;
        return Promise.resolve(state.execution);
      },
      rollbackAsync: () => Promise.resolve({ state: 'completed', evidence: [], diagnostics: [] }),
    },
  };
  return { ports, state };
}

/*** Build one complete executable plan containing a single reversible local file step. */
function planFixture(): ApmPlanResult {
  const step = stepFixture();
  return {
    schemaVersion: 2,
    operation: 'plan',
    id: 'plan-1',
    rootPath: '/project',
    complete: true,
    policy: {
      dependencyUpdates: 'none',
      selections: [],
      repairInstallations: true,
      repairProjections: true,
      maxGeneratorIterations: 4,
    },
    executor: EXECUTOR,
    inputFingerprint: { value: 'fingerprint', statusSchemaVersion: 2, availabilityCheckedAt: [] },
    targets: [],
    files: [
      {
        path: 'package.json',
        kind: 'update',
        beforeDigest: 'before',
        afterDigest: 'after',
        beforeContent: '{}',
        afterContent: '{"updated":true}',
      },
    ],
    packages: [],
    artifacts: [],
    steps: [step],
    effects: [],
    findings: [],
    blockers: [],
    diagnostics: [],
  };
}

/*** Build one local file step whose postcondition can be observed after an interrupted process. */
function stepFixture(): ApmPlanStep {
  return {
    id: 'dependency-files:root',
    kind: 'dependency-files',
    prerequisites: [],
    installRootId: 'root',
    reason: 'Apply reviewed file changes.',
    evidence: ['package.json'],
    execution: { kind: 'dependency-files', filePaths: ['package.json'] },
  };
}

/*** Build a completed operation journal for duplicate invocation behavior. */
function completedJournalFixture(): ApmApplyJournal {
  const journal = createApplyJournal(
    planFixture(),
    PERMISSIONS,
    'op-completed',
    '2026-09-14T19:00:00.000Z',
  );
  return {
    ...journal,
    status: 'completed',
    steps: journal.steps.map((step) => ({ ...step, state: 'committed' as const, attempts: 1 })),
  };
}

/*** Build a journal representing a process lost after the reviewed effect began. */
function startedJournalFixture(): ApmApplyJournal {
  const journal = createApplyJournal(
    planFixture(),
    PERMISSIONS,
    'op-lost',
    '2026-09-14T19:00:00.000Z',
  );
  return {
    ...journal,
    status: 'recovery-required',
    steps: journal.steps.map((step) => ({
      ...step,
      state: 'effect-started' as const,
      attempts: 1,
    })),
  };
}

/*** Build one lock identity tied to a durable operation and reviewed plan. */
function lockIdentity(operationId: string, planId = 'plan-1') {
  return {
    schemaVersion: 1 as const,
    operationId,
    planId,
    pid: 123,
    hostname: 'fixture-host',
    acquiredAt: '2026-09-14T19:00:00.000Z',
  };
}

/*** Build status evidence used only by new-operation saved-plan revalidation. */
function statusFixture(): ApmStatusResult {
  return {
    schemaVersion: 2,
    operation: 'status',
    rootPath: '/project',
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

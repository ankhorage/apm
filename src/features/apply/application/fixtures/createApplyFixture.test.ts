import type {
  ApmApplyJournal,
  ApmApplyLockAcquireResult,
  ApmApplyPorts,
  ApmApplyStepExecutionResult,
  ApmApplyStepObservation,
} from '../../../../types/apply.js';
import type { ApmPlanResult, ApmPlanStep } from '../../../../types/plan.js';
import type { ApmStatusResult } from '../../../../types/status.js';
import { createApplyJournal } from '../../domain/createApplyJournal.js';
import { applyAsync } from '../applyAsync.js';

/*** Provide independently owned fake ports and immutable reviewed states for apply/recovery behavior. */
export function createApplyFixture() {
  const fixture = portsFixture();
  return {
    ...fixture,
    permissions: PERMISSIONS,
    plan: planFixture(),
    step: stepFixture(),
    startedJournal: startedJournalFixture(),
    completedJournal: completedJournalFixture(),
    createLockIdentity: lockIdentity,
    resumeAfterAcquisitionAsync: (initial: ApmApplyJournal, advanceWriter: () => void) =>
      resumeAfterAcquisitionAsync(fixture, initial, advanceWriter),
  };
}

const PERMISSIONS = { ownerCode: false, lifecycleScripts: false, externalEffects: false } as const;
const EXECUTOR = { apmVersion: '0.4.0', runtime: 'node' as const, runtimeVersion: '24.0.0' };

interface ApplyFixtureState {
  journal?: ApmApplyJournal;
  planValidationBlockers: Awaited<ReturnType<ApmApplyPorts['planValidation']['validateAsync']>>;
  lockResult: ApmApplyLockAcquireResult;
  recoveredLockResult: ApmApplyLockAcquireResult;
  observation: ApmApplyStepObservation;
  execution: ApmApplyStepExecutionResult;
  createdJournals: number;
  writtenJournals: number;
  releaseCalls: number;
  observedStepIds: string[];
  executedStepIds: string[];
  lockCalls: number;
  recoverCalls: number;
  executeCalls: number;
}

/*** Build in-memory apply ports around independently owned fake boundaries. */
function portsFixture(): { readonly ports: ApmApplyPorts; readonly state: ApplyFixtureState } {
  const state = initialFixtureState();
  const ports: ApmApplyPorts = {
    clock: { nowIso: () => '2026-09-14T20:00:00.000Z' },
    operationId: { createOperationId: () => 'op-1' },
    lock: lockPortFixture(state),
    journal: journalPortFixture(state),
    status: { inspectStatusAsync: () => Promise.resolve(statusFixture()) },
    planValidation: { validateAsync: () => Promise.resolve(state.planValidationBlockers) },
    executor: { current: () => EXECUTOR },
    step: stepPortFixture(state),
  };
  return { ports, state };
}

/*** Create the mutable fake state observed through the apply port boundaries. */
function initialFixtureState(): ApplyFixtureState {
  return {
    planValidationBlockers: [],
    lockResult: { state: 'acquired', lock: lockIdentity('op-1') },
    recoveredLockResult: { state: 'acquired', lock: lockIdentity('op-1') },
    observation: { state: 'pending', evidence: [] },
    execution: { state: 'completed', evidence: ['executed'], diagnostics: [] },
    createdJournals: 0,
    writtenJournals: 0,
    releaseCalls: 0,
    observedStepIds: [],
    executedStepIds: [],
    lockCalls: 0,
    recoverCalls: 0,
    executeCalls: 0,
  };
}

/*** Build the exclusive-lock fake independently from journal and step behavior. */
function lockPortFixture(state: ApplyFixtureState): ApmApplyPorts['lock'] {
  return {
    acquireAsync: () => {
      state.lockCalls += 1;
      return Promise.resolve(state.lockResult);
    },
    recoverStaleAsync: () => {
      state.recoverCalls += 1;
      return Promise.resolve(state.recoveredLockResult);
    },
    releaseAsync: () => {
      state.releaseCalls += 1;
      return Promise.resolve();
    },
  };
}

/*** Build the durable-journal fake independently from lock and effect behavior. */
function journalPortFixture(state: ApplyFixtureState): ApmApplyPorts['journal'] {
  return {
    createAsync: (journal) => {
      state.createdJournals += 1;
      state.journal = journal;
      return Promise.resolve();
    },
    readAsync: () => Promise.resolve(state.journal),
    writeAsync: (journal) => {
      state.writtenJournals += 1;
      state.journal = journal;
      return Promise.resolve();
    },
  };
}

/*** Build the reviewed-effect fake independently from operation persistence. */
function stepPortFixture(state: ApplyFixtureState): ApmApplyPorts['step'] {
  return {
    observeAsync: ({ step }) => {
      state.observedStepIds.push(step.id);
      return Promise.resolve(state.observation);
    },
    executeAsync: ({ step }) => {
      state.executedStepIds.push(step.id);
      state.executeCalls += 1;
      return Promise.resolve(state.execution);
    },
    rollbackAsync: () => Promise.resolve({ state: 'completed', evidence: [], diagnostics: [] }),
  };
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

/*** Advance another writer deterministically after the snapshot read but before lock acquisition completes. */
async function resumeAfterAcquisitionAsync(
  fixture: ReturnType<typeof portsFixture>,
  initial: ApmApplyJournal,
  advanceWriter: () => void,
) {
  fixture.state.journal = initial;
  const ports: ApmApplyPorts = {
    ...fixture.ports,
    lock: {
      ...fixture.ports.lock,
      acquireAsync: async (input) => {
        const acquired = await fixture.ports.lock.acquireAsync(input);
        advanceWriter();
        return acquired;
      },
    },
  };
  return applyAsync(
    {
      mode: 'resume',
      rootPath: initial.rootPath,
      operationId: initial.operationId,
      permissions: PERMISSIONS,
    },
    ports,
  );
}

import type {
  ApmApplyBlocker,
  ApmApplyInput,
  ApmApplyJournal,
  ApmApplyLockAcquireResult,
  ApmApplyPorts,
  ApmApplyResult,
} from '../../../types/apply.js';
import type { ApmApplyRunOutcome } from '../../../types/apply-runtime.js';
import type {
  ApmPlanBlocker,
  ApmPlanExecutorIdentity,
  ApmPlanResult,
} from '../../../types/plan.js';
import { applyPermissionBlockers } from '../domain/applyPermissionBlockers.js';
import { createApplyJournal } from '../domain/createApplyJournal.js';
import { persistApplyJournalAsync } from './persistApplyJournalAsync.js';
import { runApplyStepsAsync } from './runApplyStepsAsync.js';

/*** Start or resume one reviewed plan under an exclusive durable project operation lock. */
export async function applyAsync(
  input: ApmApplyInput,
  ports: ApmApplyPorts,
): Promise<ApmApplyResult> {
  return input.mode === 'start' ? startApplyAsync(input, ports) : resumeApplyAsync(input, ports);
}

/*** Revalidate a new reviewed plan before creating any durable mutation journal or project effect. */
async function startApplyAsync(
  input: Extract<ApmApplyInput, { readonly mode: 'start' }>,
  ports: ApmApplyPorts,
): Promise<ApmApplyResult> {
  const operationId = ports.operationId.createOperationId();
  const preliminary = [
    ...(input.plan.complete ? [] : [planIncompleteBlocker(input.plan)]),
    ...applyPermissionBlockers(input.plan, input.permissions),
  ];
  if (preliminary.length > 0) {
    return blockedResult(operationId, input.plan.rootPath, input.plan.id, preliminary);
  }
  const lock = await acquireLockAsync(
    input.plan.rootPath,
    operationId,
    input.plan.id,
    false,
    ports,
  );
  if (lock.state !== 'acquired') {
    return blockedResult(operationId, input.plan.rootPath, input.plan.id, [lockBlocker(lock)]);
  }
  try {
    const status = await ports.status.inspectStatusAsync(input.plan.rootPath);
    const planBlockers = await ports.planValidation.validateAsync({
      plan: input.plan,
      status,
      executor: ports.executor.current(),
    });
    const blockers = planBlockers.map(toApplyValidationBlocker);
    if (blockers.length > 0) {
      return blockedResult(operationId, input.plan.rootPath, input.plan.id, blockers);
    }
    const journal = createApplyJournal(
      input.plan,
      input.permissions,
      operationId,
      ports.clock.nowIso(),
    );
    await ports.journal.createAsync(journal);
    return outcomeResult(await runApplyStepsAsync(journal, ports));
  } finally {
    await ports.lock.releaseAsync(input.plan.rootPath, operationId);
  }
}

/*** Load one durable operation before delegating resume validation and lock ownership. */
async function resumeApplyAsync(
  input: Extract<ApmApplyInput, { readonly mode: 'resume' }>,
  ports: ApmApplyPorts,
): Promise<ApmApplyResult> {
  const journal = await ports.journal.readAsync(input.rootPath, input.operationId);
  return journal === undefined
    ? blockedResult(input.operationId, input.rootPath, undefined, [operationNotFoundBlocker(input)])
    : resumeExistingJournalAsync(input, journal, ports);
}

/*** Validate durable identity, executor and permissions without reusing the original project fingerprint. */
async function resumeExistingJournalAsync(
  input: Extract<ApmApplyInput, { readonly mode: 'resume' }>,
  journal: ApmApplyJournal,
  ports: ApmApplyPorts,
): Promise<ApmApplyResult> {
  const journalBlockers = validateResumeJournal(input, journal, ports.executor.current());
  if (journalBlockers.length > 0) {
    return blockedResult(
      input.operationId,
      input.rootPath,
      journal.plan.id,
      journalBlockers,
      journal,
    );
  }
  if (journal.status === 'completed') return completedDuplicateResult(journal);
  const permissionBlockers = applyPermissionBlockers(journal.plan, input.permissions);
  return permissionBlockers.length > 0
    ? blockedResult(input.operationId, input.rootPath, journal.plan.id, permissionBlockers, journal)
    : resumeUnderLockAsync(input, journal, ports);
}

/*** Recover/own the writer lock before resuming from persisted step state. */
async function resumeUnderLockAsync(
  input: Extract<ApmApplyInput, { readonly mode: 'resume' }>,
  journal: ApmApplyJournal,
  ports: ApmApplyPorts,
): Promise<ApmApplyResult> {
  const lock = await acquireLockAsync(
    input.rootPath,
    input.operationId,
    journal.plan.id,
    true,
    ports,
  );
  if (lock.state !== 'acquired') {
    return blockedResult(
      input.operationId,
      input.rootPath,
      journal.plan.id,
      [lockBlocker(lock)],
      journal,
    );
  }
  try {
    const resumed = await persistApplyJournalAsync(
      {
        kind: 'operation',
        journal: { ...journal, permissions: input.permissions },
        state: 'running',
        clearFailure: true,
      },
      ports,
    );
    return outcomeResult(await runApplyStepsAsync(resumed, ports));
  } finally {
    await ports.lock.releaseAsync(input.rootPath, input.operationId);
  }
}

/*** Acquire a lock and allow stale-lock recovery only for an explicit resume of the same operation. */
async function acquireLockAsync(
  rootPath: string,
  operationId: string,
  planId: string,
  resume: boolean,
  ports: ApmApplyPorts,
): Promise<ApmApplyLockAcquireResult> {
  const acquired = await ports.lock.acquireAsync({ rootPath, operationId, planId, resume });
  if (acquired.state !== 'stale' || !resume) return acquired;
  if (acquired.lock.operationId !== operationId || acquired.lock.planId !== planId) return acquired;
  return ports.lock.recoverStaleAsync({
    rootPath,
    operationId,
    planId,
    stale: acquired.lock,
  });
}

/*** Validate journal identity and executor compatibility without treating applied changes as staleness. */
function validateResumeJournal(
  input: Extract<ApmApplyInput, { readonly mode: 'resume' }>,
  journal: ApmApplyJournal,
  executor: ApmPlanExecutorIdentity,
): readonly ApmApplyBlocker[] {
  return [
    ...(journal.operationId === input.operationId && journal.rootPath === input.rootPath
      ? []
      : [journalIdentityBlocker(input, journal)]),
    ...(journal.plan.complete ? [] : [planIncompleteBlocker(journal.plan)]),
    ...(executorMatches(journal.plan.executor, executor)
      ? []
      : [executorIncompatibleBlocker(journal.plan.executor, executor)]),
  ];
}

/*** Compare every executor field frozen into the reviewed plan. */
function executorMatches(
  planned: ApmPlanExecutorIdentity,
  current: ApmPlanExecutorIdentity,
): boolean {
  return (
    planned.apmVersion === current.apmVersion &&
    planned.runtime === current.runtime &&
    planned.runtimeVersion === current.runtimeVersion
  );
}

/*** Convert a completed run-state outcome to the stable public apply result. */
function outcomeResult(outcome: ApmApplyRunOutcome): ApmApplyResult {
  return {
    schemaVersion: 1,
    operation: 'apply',
    operationId: outcome.journal.operationId,
    planId: outcome.journal.plan.id,
    rootPath: outcome.journal.rootPath,
    status: outcome.status,
    complete: outcome.status === 'completed',
    journal: outcome.journal,
    blockers: outcome.blockers,
    diagnostics: outcome.diagnostics,
  };
}

/*** Return idempotent success for a duplicate resume of an already completed operation. */
function completedDuplicateResult(journal: ApmApplyJournal): ApmApplyResult {
  return {
    schemaVersion: 1,
    operation: 'apply',
    operationId: journal.operationId,
    planId: journal.plan.id,
    rootPath: journal.rootPath,
    status: 'completed',
    complete: true,
    journal,
    blockers: [],
    diagnostics: [],
  };
}

/*** Build one blocked result before or without executing further reviewed steps. */
function blockedResult(
  operationId: string,
  rootPath: string,
  planId: string | undefined,
  blockers: readonly ApmApplyBlocker[],
  journal?: ApmApplyJournal,
): ApmApplyResult {
  return {
    schemaVersion: 1,
    operation: 'apply',
    operationId,
    ...(planId === undefined ? {} : { planId }),
    rootPath,
    status: 'blocked',
    complete: false,
    ...(journal === undefined ? {} : { journal }),
    blockers,
    diagnostics: [],
  };
}

/*** Map pre-mutation saved-plan validation evidence into apply-specific blocker semantics. */
function toApplyValidationBlocker(blocker: ApmPlanBlocker): ApmApplyBlocker {
  const executor = blocker.code === 'plan.executor-incompatible';
  return {
    code: executor ? 'apply.executor-incompatible' : 'apply.plan-stale',
    scope: executor ? { kind: 'host', id: 'apm' } : { kind: 'project' },
    evidence: blocker.evidence,
    reason: blocker.reason,
    ...(blocker.nextAction === undefined ? {} : { nextAction: blocker.nextAction }),
  };
}

/*** Reject starting or resuming a plan that never passed planning completeness gates. */
function planIncompleteBlocker(plan: ApmPlanResult): ApmApplyBlocker {
  return {
    code: 'apply.plan-incomplete',
    scope: { kind: 'project', path: plan.rootPath },
    evidence: plan.blockers.map(({ code }) => code),
    reason: 'Only complete reviewed plans can be applied.',
    nextAction: 'Resolve plan blockers and create a new complete plan before applying.',
  };
}

/*** Reject a live, mismatched or unprovably stale writer lock. */
function lockBlocker(
  lock: Exclude<ApmApplyLockAcquireResult, { readonly state: 'acquired' }>,
): ApmApplyBlocker {
  return {
    code: 'apply.lock-conflict',
    scope: { kind: 'operation', id: lock.lock.operationId },
    evidence: [lock.state, lock.lock.operationId, lock.lock.planId, lock.lock.hostname],
    reason: lock.reason,
    nextAction:
      lock.state === 'stale'
        ? 'Resume the matching durable operation or resolve the stale lock explicitly.'
        : 'Wait for the active operation to finish or inspect its durable journal.',
  };
}

/*** Explain a resume request whose durable operation does not exist. */
function operationNotFoundBlocker(
  input: Extract<ApmApplyInput, { readonly mode: 'resume' }>,
): ApmApplyBlocker {
  return {
    code: 'apply.operation-not-found',
    scope: { kind: 'operation', id: input.operationId, path: input.rootPath },
    evidence: [input.operationId],
    reason: 'No durable APM operation journal exists for this resume request.',
  };
}

/*** Explain a durable journal whose project/operation identity differs from the resume request. */
function journalIdentityBlocker(
  input: Extract<ApmApplyInput, { readonly mode: 'resume' }>,
  journal: ApmApplyJournal,
): ApmApplyBlocker {
  return {
    code: 'apply.journal-invalid',
    scope: { kind: 'operation', id: input.operationId, path: input.rootPath },
    evidence: [journal.operationId, journal.rootPath],
    reason: 'Durable operation journal identity does not match the requested project operation.',
    nextAction: 'Use the journal from the matching project root and operation ID.',
  };
}

/*** Reject resume under a host/runtime that differs from the reviewed plan executor identity. */
function executorIncompatibleBlocker(
  planned: ApmPlanExecutorIdentity,
  current: ApmPlanExecutorIdentity,
): ApmApplyBlocker {
  return {
    code: 'apply.executor-incompatible',
    scope: { kind: 'host', id: 'apm' },
    evidence: [executorKey(planned), executorKey(current)],
    reason:
      'Current APM/runtime executor does not match the executor frozen into the operation plan.',
    nextAction: 'Use the reviewed executor or create a new plan with the current executor.',
  };
}

/*** Render one stable executor identity for recovery blocker evidence. */
function executorKey(executor: ApmPlanExecutorIdentity): string {
  return [executor.apmVersion, executor.runtime, executor.runtimeVersion ?? ''].join('\0');
}

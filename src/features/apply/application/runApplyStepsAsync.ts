import type {
  ApmApplyBlocker,
  ApmApplyFailure,
  ApmApplyJournal,
  ApmApplyPorts,
  ApmApplyStepExecutionResult,
  ApmApplyStepObservation,
} from '../../../types/apply.js';
import type { ApmApplyRunOutcome } from '../../../types/apply-runtime.js';
import type { ApmPlanStep } from '../../../types/plan.js';
import type { ApmStatusDiagnostic } from '../../../types/status.js';
import { applyStepRecoveryPolicy } from '../domain/applyStepRecoveryPolicy.js';
import { transitionApplyJournal } from '../domain/transitionApplyJournal.js';

/*** Execute or resume reviewed plan steps using durable observe-before-repeat recovery semantics. */
export async function runApplyStepsAsync(
  journal: ApmApplyJournal,
  ports: ApmApplyPorts,
): Promise<ApmApplyRunOutcome> {
  return runNextStepAsync(journal, ports, []);
}

/*** Process the next uncommitted step or finalize the operation when all local work is accounted for. */
async function runNextStepAsync(
  journal: ApmApplyJournal,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  const step = journal.plan.steps.find((candidate) => !isCommitted(journal, candidate.id));
  if (step === undefined) return completeOperationAsync(journal, ports, diagnostics);
  if (await cancellationRequestedAsync(journal.operationId, ports)) {
    return cancelOperationAsync(journal, step, ports, diagnostics);
  }
  if (!prerequisitesCommitted(journal, step)) {
    return recoveryRequiredAsync(
      journal,
      step,
      prerequisiteBlocker(step),
      ports,
      diagnostics,
    );
  }
  return processStepAsync(journal, step, ports, diagnostics);
}

/*** Observe one step before deciding whether to skip, recover, defer or execute it. */
async function processStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  const policy = applyStepRecoveryPolicy(step);
  if (policy.deferred) {
    const committed = await commitDeferredStepAsync(journal, step, ports);
    return runNextStepAsync(committed, ports, diagnostics);
  }
  const observation = await ports.step.observeAsync({ journal, step });
  if (observation.state === 'satisfied') {
    const committed = await commitObservedStepAsync(journal, step, observation, ports);
    return runNextStepAsync(committed, ports, diagnostics);
  }
  if (observation.state === 'conflict') {
    return recoveryRequiredAsync(
      journal,
      step,
      preconditionBlocker(step, observation),
      ports,
      diagnostics,
    );
  }
  const record = journal.steps.find(({ stepId }) => stepId === step.id);
  if (record === undefined) {
    return recoveryRequiredAsync(journal, step, missingJournalStepBlocker(step), ports, diagnostics);
  }
  if (effectMayHaveStarted(record.state) && !policy.restartable) {
    return recoveryRequiredAsync(
      journal,
      step,
      uncertainEffectBlocker(step, observation),
      ports,
      diagnostics,
    );
  }
  return executeStepAsync(journal, step, ports, diagnostics);
}

/*** Persist intent/start markers, invoke the side-effect port, then verify the reviewed postcondition. */
async function executeStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  const intended = await persistStepAsync(journal, step, 'intended', ports, [], false, true);
  const started = await persistStepAsync(intended, step, 'effect-started', ports, [], true, true);
  const execution = await safeExecuteAsync(started, step, ports);
  const nextDiagnostics = [...diagnostics, ...execution.diagnostics];
  if (execution.state === 'unknown') {
    return recoveryRequiredAsync(
      started,
      step,
      unknownExecutionBlocker(step, execution),
      ports,
      nextDiagnostics,
    );
  }
  if (execution.state === 'failed') {
    return knownFailureAsync(started, step, execution, ports, nextDiagnostics);
  }
  return verifyExecutedStepAsync(started, step, execution, ports, nextDiagnostics);
}

/*** Observe the exact expected output after a reported successful effect before committing it. */
async function verifyExecutedStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  execution: ApmApplyStepExecutionResult,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  const observation = await ports.step.observeAsync({ journal, step });
  if (observation.state !== 'satisfied') {
    return recoveryRequiredAsync(
      journal,
      step,
      outputMismatchBlocker(step, execution, observation),
      ports,
      diagnostics,
    );
  }
  const committed = await commitObservedStepAsync(
    journal,
    step,
    { ...observation, evidence: [...execution.evidence, ...observation.evidence] },
    ports,
  );
  return runNextStepAsync(committed, ports, diagnostics);
}

/*** Handle a known failed effect, rolling back only when the reviewed recovery policy permits it. */
async function knownFailureAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  execution: ApmApplyStepExecutionResult,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  const policy = applyStepRecoveryPolicy(step);
  if (!policy.reversible) {
    return failedOperationAsync(journal, step, executionFailure(step, execution), ports, diagnostics);
  }
  const rollback = await safeRollbackAsync(journal, step, ports);
  const nextDiagnostics = [...diagnostics, ...rollback.diagnostics];
  if (rollback.state === 'completed') {
    return failedOperationAsync(
      journal,
      step,
      executionFailure(step, execution),
      ports,
      nextDiagnostics,
    );
  }
  return recoveryRequiredAsync(
    journal,
    step,
    rollbackFailureBlocker(step, rollback),
    ports,
    nextDiagnostics,
  );
}

/*** Persist effect-observed and committed separately so crash recovery can distinguish them. */
async function commitObservedStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  observation: ApmApplyStepObservation,
  ports: ApmApplyPorts,
): Promise<ApmApplyJournal> {
  const observed = await persistStepAsync(
    journal,
    step,
    'effect-observed',
    ports,
    observation.evidence,
    false,
    true,
  );
  return persistStepAsync(observed, step, 'committed', ports, observation.evidence, false, true);
}

/*** Mark a non-incidental follow-up as accounted for without pretending APM executed it. */
async function commitDeferredStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  ports: ApmApplyPorts,
): Promise<ApmApplyJournal> {
  return persistStepAsync(
    journal,
    step,
    'committed',
    ports,
    [...step.evidence, `deferred:${step.execution.kind}`],
    false,
    true,
  );
}

/*** Persist one immutable journal transition and publish progress after durable storage succeeds. */
async function persistStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  state: ApmApplyJournal['steps'][number]['state'],
  ports: ApmApplyPorts,
  evidence: readonly string[],
  incrementAttempts: boolean,
  clearFailure: boolean,
): Promise<ApmApplyJournal> {
  const next = transitionApplyJournal({
    journal,
    stepId: step.id,
    state,
    now: ports.clock.nowIso(),
    evidence,
    incrementAttempts,
    clearFailure,
    clearOperationFailure: clearFailure,
    journalStatus: 'running',
  });
  await ports.journal.writeAsync(next);
  await publishProgressAsync(next, step.id, state, ports);
  return next;
}

/*** Convert unexpected adapter throws to an unknown effect instead of assuming no side effect happened. */
async function safeExecuteAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  ports: ApmApplyPorts,
): Promise<ApmApplyStepExecutionResult> {
  try {
    return await ports.step.executeAsync({ journal, step });
  } catch (error) {
    return {
      state: 'unknown',
      evidence: [error instanceof Error ? error.message : 'unknown step execution failure'],
      diagnostics: [],
      failure: executionExceptionFailure(error),
    };
  }
}

/*** Convert unexpected rollback throws to unknown recovery state instead of claiming rollback success. */
async function safeRollbackAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  ports: ApmApplyPorts,
): Promise<ApmApplyStepExecutionResult> {
  try {
    return await ports.step.rollbackAsync({ journal, step });
  } catch (error) {
    return {
      state: 'unknown',
      evidence: [error instanceof Error ? error.message : 'unknown rollback failure'],
      diagnostics: [],
      failure: executionExceptionFailure(error),
    };
  }
}

/*** Finalize a successful operation only after every reviewed/deferred step is committed. */
async function completeOperationAsync(
  journal: ApmApplyJournal,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  const completed = { ...journal, status: 'completed' as const, updatedAt: ports.clock.nowIso() };
  await ports.journal.writeAsync(completed);
  await publishProgressAsync(completed, undefined, 'completed', ports);
  return { journal: completed, status: 'completed', blockers: [], diagnostics };
}

/*** Persist deterministic cancellation before the next side effect begins. */
async function cancelOperationAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  const failure = cancellationFailure(step);
  const cancelled = transitionApplyJournal({
    journal,
    stepId: step.id,
    state: 'cancelled',
    now: ports.clock.nowIso(),
    failure,
    journalStatus: 'cancelled',
    operationFailure: failure,
  });
  await ports.journal.writeAsync(cancelled);
  await publishProgressAsync(cancelled, step.id, 'cancelled', ports);
  return {
    journal: cancelled,
    status: 'cancelled',
    blockers: [cancellationBlocker(step)],
    diagnostics,
  };
}

/*** Persist a known failed step without claiming unknown side effects or unsafe rollback. */
async function failedOperationAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  failure: ApmApplyFailure,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  const failed = transitionApplyJournal({
    journal,
    stepId: step.id,
    state: 'failed',
    now: ports.clock.nowIso(),
    failure,
    journalStatus: 'failed',
    operationFailure: failure,
  });
  await ports.journal.writeAsync(failed);
  await publishProgressAsync(failed, step.id, 'failed', ports);
  return { journal: failed, status: 'failed', blockers: [stepFailureBlocker(step, failure)], diagnostics };
}

/*** Persist an ambiguous effect as recovery-required rather than retrying or rolling back optimistically. */
async function recoveryRequiredAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  blocker: ApmApplyBlocker,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  const failure = blockerFailure(blocker);
  const recovery = transitionApplyJournal({
    journal,
    stepId: step.id,
    state: 'recovery-required',
    now: ports.clock.nowIso(),
    failure,
    journalStatus: 'recovery-required',
    operationFailure: failure,
  });
  await ports.journal.writeAsync(recovery);
  await publishProgressAsync(recovery, step.id, 'recovery-required', ports);
  return { journal: recovery, status: 'recovery-required', blockers: [blocker], diagnostics };
}

/*** Check cancellation only at safe step boundaries; adapters may implement their own bounded process aborts. */
async function cancellationRequestedAsync(
  operationId: string,
  ports: ApmApplyPorts,
): Promise<boolean> {
  return ports.cancellation === undefined
    ? false
    : ports.cancellation.isCancellationRequestedAsync(operationId);
}

/*** Publish optional progress without making UI/transport delivery part of apply correctness. */
async function publishProgressAsync(
  journal: ApmApplyJournal,
  stepId: string | undefined,
  state: ApmApplyJournal['status'] | ApmApplyJournal['steps'][number]['state'],
  ports: ApmApplyPorts,
): Promise<void> {
  if (ports.progress === undefined) return;
  await ports.progress.publishAsync({
    operationId: journal.operationId,
    ...(stepId === undefined ? {} : { stepId }),
    state,
    message: stepId === undefined ? `Apply ${state}.` : `${stepId}: ${state}`,
  });
}

/*** Test whether the durable journal already committed one reviewed step. */
function isCommitted(journal: ApmApplyJournal, stepId: string): boolean {
  return journal.steps.some((step) => step.stepId === stepId && step.state === 'committed');
}

/*** Require every explicit prerequisite to be durably committed before the dependent step. */
function prerequisitesCommitted(journal: ApmApplyJournal, step: ApmPlanStep): boolean {
  return step.prerequisites.every((stepId) => isCommitted(journal, stepId));
}

/*** Identify journal states where an effect may already have escaped before a crash or retry. */
function effectMayHaveStarted(state: ApmApplyJournal['steps'][number]['state']): boolean {
  return ['effect-started', 'effect-observed', 'failed', 'recovery-required'].includes(state);
}

/*** Build a stable failure payload for unexpected adapter exceptions. */
function executionExceptionFailure(error: unknown): ApmApplyFailure {
  return {
    code: 'apply.execution-exception',
    reason: 'Execution adapter failed without proving whether the reviewed effect completed.',
    evidence: [error instanceof Error ? error.message : 'unknown adapter failure'],
    nextAction: 'Resume the operation so APM can inspect the reviewed postcondition before retrying.',
  };
}

/*** Prefer adapter failure evidence while retaining a deterministic fallback for known failed effects. */
function executionFailure(
  step: ApmPlanStep,
  execution: ApmApplyStepExecutionResult,
): ApmApplyFailure {
  return execution.failure ?? {
    code: 'apply.step-failed',
    reason: `Reviewed step ${step.id} reported a known execution failure.`,
    evidence: execution.evidence,
    nextAction: 'Inspect the recorded evidence, correct the cause, then resume when the step is restartable.',
  };
}

/*** Convert one blocker to the durable failure shape stored in the journal. */
function blockerFailure(blocker: ApmApplyBlocker): ApmApplyFailure {
  return {
    code: blocker.code,
    reason: blocker.reason,
    evidence: blocker.evidence,
    ...(blocker.nextAction === undefined ? {} : { nextAction: blocker.nextAction }),
  };
}

/*** Build a deterministic cancellation failure for journal persistence. */
function cancellationFailure(step: ApmPlanStep): ApmApplyFailure {
  return {
    code: 'apply.cancelled',
    reason: `Apply was cancelled before reviewed step ${step.id} began.`,
    evidence: [step.id],
    nextAction: 'Resume the same operation to continue from durable journal state.',
  };
}

/*** Explain a cancelled step to machine-readable callers. */
function cancellationBlocker(step: ApmPlanStep): ApmApplyBlocker {
  return {
    code: 'apply.cancelled',
    scope: { kind: 'step', id: step.id },
    evidence: [step.id],
    reason: 'Apply was cancelled at a safe step boundary.',
    nextAction: 'Resume the same operation to continue.',
  };
}

/*** Explain a corrupt/out-of-order journal that lacks committed prerequisites. */
function prerequisiteBlocker(step: ApmPlanStep): ApmApplyBlocker {
  return {
    code: 'apply.prerequisite-incomplete',
    scope: { kind: 'step', id: step.id },
    evidence: step.prerequisites,
    reason: 'A reviewed step prerequisite is not durably committed.',
    nextAction: 'Resume from the earliest incomplete prerequisite or inspect the operation journal.',
  };
}

/*** Explain project drift detected before a reviewed step writes its owned scope. */
function preconditionBlocker(
  step: ApmPlanStep,
  observation: ApmApplyStepObservation,
): ApmApplyBlocker {
  return {
    code: 'apply.precondition-changed',
    scope: { kind: 'step', id: step.id },
    evidence: observation.evidence,
    reason: observation.reason ?? 'Reviewed step preconditions no longer match the current project state.',
    nextAction: 'Preserve the external edits and create a new plan or reconcile them before resuming.',
  };
}

/*** Explain a plan/journal mismatch where one reviewed step has no durable record. */
function missingJournalStepBlocker(step: ApmPlanStep): ApmApplyBlocker {
  return {
    code: 'apply.journal-invalid',
    scope: { kind: 'step', id: step.id },
    evidence: [step.id],
    reason: 'Durable operation journal does not contain the reviewed plan step.',
    nextAction: 'Do not mutate the project; inspect or restore the operation journal.',
  };
}

/*** Explain why an uncertain non-restartable effect must stop for explicit recovery. */
function uncertainEffectBlocker(
  step: ApmPlanStep,
  observation: ApmApplyStepObservation,
): ApmApplyBlocker {
  return {
    code: 'apply.recovery-required',
    scope: { kind: 'step', id: step.id },
    evidence: observation.evidence,
    reason: `Reviewed step ${step.id} may have started and is not safely restartable.`,
    nextAction: 'Inspect the step postcondition and follow package-owned recovery guidance before resuming.',
  };
}

/*** Explain an adapter result whose completion cannot be proven after execution. */
function unknownExecutionBlocker(
  step: ApmPlanStep,
  execution: ApmApplyStepExecutionResult,
): ApmApplyBlocker {
  return {
    code: 'apply.recovery-required',
    scope: { kind: 'step', id: step.id },
    evidence: execution.evidence,
    reason: execution.failure?.reason ?? 'Execution result is ambiguous and cannot be committed safely.',
    nextAction: execution.failure?.nextAction ?? 'Resume to inspect the reviewed postcondition before retrying.',
  };
}

/*** Explain a successful adapter return whose actual project state does not match the reviewed output. */
function outputMismatchBlocker(
  step: ApmPlanStep,
  execution: ApmApplyStepExecutionResult,
  observation: ApmApplyStepObservation,
): ApmApplyBlocker {
  return {
    code: 'apply.output-mismatch',
    scope: { kind: 'step', id: step.id },
    evidence: [...execution.evidence, ...observation.evidence],
    reason: observation.reason ?? 'Actual step output does not match the reviewed plan postcondition.',
    nextAction: 'Do not continue; inspect the changed scope and create or resume recovery from this operation.',
  };
}

/*** Explain an automatic rollback that did not prove restoration of the reversible local step. */
function rollbackFailureBlocker(
  step: ApmPlanStep,
  rollback: ApmApplyStepExecutionResult,
): ApmApplyBlocker {
  return {
    code: 'apply.recovery-required',
    scope: { kind: 'step', id: step.id },
    evidence: rollback.evidence,
    reason: 'Automatic rollback could not prove restoration of the reviewed local pre-state.',
    nextAction: 'Use the operation snapshots and recorded evidence for explicit recovery.',
  };
}

/*** Explain one known failed effect after any permitted local rollback completed. */
function stepFailureBlocker(step: ApmPlanStep, failure: ApmApplyFailure): ApmApplyBlocker {
  return {
    code: 'apply.step-failed',
    scope: { kind: 'step', id: step.id },
    evidence: failure.evidence,
    reason: failure.reason,
    ...(failure.nextAction === undefined ? {} : { nextAction: failure.nextAction }),
  };
}

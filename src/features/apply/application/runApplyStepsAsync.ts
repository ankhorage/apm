import type {
  ApmApplyJournal,
  ApmApplyPorts,
  ApmApplyStepExecutionResult,
  ApmApplyStepObservation,
} from '../../../types/apply.js';
import type { ApmApplyRunOutcome } from '../../../types/apply-runtime.js';
import type { ApmPlanStep } from '../../../types/plan.js';
import type { ApmStatusDiagnostic } from '../../../types/status.js';
import { applyStepRecoveryPolicy } from '../domain/applyStepRecoveryPolicy.js';
import { createApplyBlocker } from '../domain/createApplyBlocker.js';
import { createApplyFailure } from '../domain/createApplyFailure.js';
import { decideApplyStepObservation } from '../domain/decideApplyStepObservation.js';
import { finishApplyOperationAsync } from './finishApplyOperationAsync.js';
import { persistApplyJournalAsync } from './persistApplyJournalAsync.js';

/*** Execute or resume reviewed plan steps using durable observe-before-repeat recovery semantics. */
export async function runApplyStepsAsync(
  journal: ApmApplyJournal,
  ports: ApmApplyPorts,
): Promise<ApmApplyRunOutcome> {
  return runNextStepAsync(journal, ports, []);
}

/*** Process the next uncommitted step or finalize after all reviewed work is accounted for. */
async function runNextStepAsync(
  journal: ApmApplyJournal,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  const step = journal.plan.steps.find((candidate) => !isCommitted(journal, candidate.id));
  if (step === undefined) {
    return finishApplyOperationAsync({ kind: 'completed', journal, diagnostics }, ports);
  }
  if (await cancellationRequestedAsync(journal.operationId, ports)) {
    return finishApplyOperationAsync({ kind: 'cancelled', journal, step, diagnostics }, ports);
  }
  if (!prerequisitesCommitted(journal, step)) {
    return finishApplyOperationAsync(
      {
        kind: 'recovery-required',
        journal,
        step,
        blocker: createApplyBlocker({ kind: 'prerequisite-incomplete', step }),
        diagnostics,
      },
      ports,
    );
  }
  return processStepAsync(journal, step, ports, diagnostics);
}

/*** Observe a step before delegating the resulting commit/recovery/execute decision. */
async function processStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  if (applyStepRecoveryPolicy(step).deferred) {
    const committed = await commitDeferredStepAsync(journal, step, ports);
    return runNextStepAsync(committed, ports, diagnostics);
  }
  const observation = await ports.step.observeAsync({ journal, step });
  return handleObservedStepAsync(journal, step, observation, ports, diagnostics);
}

/*** Apply the pure observation decision without mixing it into observation I/O. */
async function handleObservedStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  observation: ApmApplyStepObservation,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  const decision = decideApplyStepObservation(journal, step, observation).action;
  if (decision === 'commit') {
    const committed = await commitObservedStepAsync(journal, step, observation, ports);
    return runNextStepAsync(committed, ports, diagnostics);
  }
  if (decision === 'execute') return executeStepAsync(journal, step, ports, diagnostics);
  return finishApplyOperationAsync(
    {
      kind: 'recovery-required',
      journal,
      step,
      blocker: observedRecoveryBlocker(decision, step, observation),
      diagnostics,
    },
    ports,
  );
}

/*** Convert one non-executable observation decision to its stable recovery blocker. */
function observedRecoveryBlocker(
  decision: 'recover-precondition' | 'recover-journal' | 'recover-uncertain',
  step: ApmPlanStep,
  observation: ApmApplyStepObservation,
) {
  if (decision === 'recover-precondition') {
    return createApplyBlocker({ kind: 'precondition-changed', step, observation });
  }
  return decision === 'recover-journal'
    ? createApplyBlocker({ kind: 'journal-step-missing', step })
    : createApplyBlocker({ kind: 'uncertain-effect', step, observation });
}

/*** Persist intent/start markers, invoke the effect port, and verify the reviewed postcondition. */
async function executeStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  const intended = await persistApplyJournalAsync(
    {
      kind: 'step',
      journal,
      step,
      state: 'intended',
      evidence: [],
      clearFailure: true,
      journalStatus: 'running',
    },
    ports,
  );
  const started = await persistApplyJournalAsync(
    {
      kind: 'step',
      journal: intended,
      step,
      state: 'effect-started',
      evidence: [],
      incrementAttempts: true,
      clearFailure: true,
      journalStatus: 'running',
    },
    ports,
  );
  const execution = await safeStepEffectAsync('execute', started, step, ports);
  const nextDiagnostics = [...diagnostics, ...execution.diagnostics];
  if (execution.state === 'unknown') {
    return finishApplyOperationAsync(
      {
        kind: 'recovery-required',
        journal: started,
        step,
        blocker: createApplyBlocker({ kind: 'unknown-execution', step, execution }),
        diagnostics: nextDiagnostics,
      },
      ports,
    );
  }
  if (execution.state === 'failed') {
    return knownFailureAsync(started, step, execution, ports, nextDiagnostics);
  }
  return verifyExecutedStepAsync(started, step, execution, ports, nextDiagnostics);
}

/*** Verify actual output after a reported successful effect before committing the step. */
async function verifyExecutedStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  execution: ApmApplyStepExecutionResult,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  const observation = await ports.step.observeAsync({ journal, step });
  if (observation.state !== 'satisfied') {
    return finishApplyOperationAsync(
      {
        kind: 'recovery-required',
        journal,
        step,
        blocker: createApplyBlocker({ kind: 'output-mismatch', step, execution, observation }),
        diagnostics,
      },
      ports,
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

/*** Roll back only explicitly reversible local effects after a known execution failure. */
async function knownFailureAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  execution: ApmApplyStepExecutionResult,
  ports: ApmApplyPorts,
  diagnostics: readonly ApmStatusDiagnostic[],
): Promise<ApmApplyRunOutcome> {
  const failure = createApplyFailure({ kind: 'known-execution', step, execution });
  if (!applyStepRecoveryPolicy(step).reversible) {
    return finishApplyOperationAsync(
      { kind: 'failed', journal, step, failure, diagnostics },
      ports,
    );
  }
  const rollback = await safeStepEffectAsync('rollback', journal, step, ports);
  const nextDiagnostics = [...diagnostics, ...rollback.diagnostics];
  if (rollback.state === 'completed') {
    return finishApplyOperationAsync(
      { kind: 'failed', journal, step, failure, diagnostics: nextDiagnostics },
      ports,
    );
  }
  return finishApplyOperationAsync(
    {
      kind: 'recovery-required',
      journal,
      step,
      blocker: createApplyBlocker({ kind: 'rollback-failed', step, execution: rollback }),
      diagnostics: nextDiagnostics,
    },
    ports,
  );
}

/*** Invoke execute/rollback while preserving ambiguity when an adapter throws unexpectedly. */
async function safeStepEffectAsync(
  action: 'execute' | 'rollback',
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  ports: ApmApplyPorts,
): Promise<ApmApplyStepExecutionResult> {
  try {
    return action === 'execute'
      ? await ports.step.executeAsync({ journal, step })
      : await ports.step.rollbackAsync({ journal, step });
  } catch (error) {
    return {
      state: 'unknown',
      evidence: [error instanceof Error ? error.message : `unknown ${action} failure`],
      diagnostics: [],
      failure: createApplyFailure({ kind: 'execution-exception', error }),
    };
  }
}

/*** Persist observed and committed separately so a crash between them remains recoverable. */
async function commitObservedStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  observation: ApmApplyStepObservation,
  ports: ApmApplyPorts,
): Promise<ApmApplyJournal> {
  const observed = await persistApplyJournalAsync(
    {
      kind: 'step',
      journal,
      step,
      state: 'effect-observed',
      evidence: observation.evidence,
      clearFailure: true,
      journalStatus: 'running',
    },
    ports,
  );
  return persistApplyJournalAsync(
    {
      kind: 'step',
      journal: observed,
      step,
      state: 'committed',
      evidence: observation.evidence,
      clearFailure: true,
      journalStatus: 'running',
    },
    ports,
  );
}

/*** Account for shipment/restart follow-up without pretending APM executed the external action. */
async function commitDeferredStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  ports: ApmApplyPorts,
): Promise<ApmApplyJournal> {
  return persistApplyJournalAsync(
    {
      kind: 'step',
      journal,
      step,
      state: 'committed',
      evidence: [...step.evidence, `deferred:${step.execution.kind}`],
      clearFailure: true,
      journalStatus: 'running',
    },
    ports,
  );
}

/*** Check cancellation only at safe step boundaries. */
async function cancellationRequestedAsync(
  operationId: string,
  ports: ApmApplyPorts,
): Promise<boolean> {
  return ports.cancellation === undefined
    ? false
    : ports.cancellation.isCancellationRequestedAsync(operationId);
}

/*** Test whether one reviewed step is durably committed. */
function isCommitted(journal: ApmApplyJournal, stepId: string): boolean {
  return journal.steps.some((step) => step.stepId === stepId && step.state === 'committed');
}

/*** Require all reviewed prerequisites to be durably committed before a dependent step. */
function prerequisitesCommitted(journal: ApmApplyJournal, step: ApmPlanStep): boolean {
  return step.prerequisites.every((stepId) => isCommitted(journal, stepId));
}

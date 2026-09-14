import type {
  ApmApplyBlocker,
  ApmApplyFailure,
  ApmApplyJournal,
  ApmApplyPorts,
} from '../../../types/apply.js';
import type { ApmApplyRunOutcome } from '../../../types/apply-runtime.js';
import type { ApmPlanStep } from '../../../types/plan.js';
import type { ApmStatusDiagnostic } from '../../../types/status.js';
import { createApplyBlocker } from '../domain/createApplyBlocker.js';
import { createApplyFailure } from '../domain/createApplyFailure.js';
import { persistApplyJournalAsync } from './persistApplyJournalAsync.js';

/*** Persist and report one terminal apply outcome after the last safe journal transition. */
export async function finishApplyOperationAsync(
  input: FinishApplyOperationInput,
  ports: ApmApplyPorts,
): Promise<ApmApplyRunOutcome> {
  switch (input.kind) {
    case 'completed':
      return completedAsync(input, ports);
    case 'cancelled':
      return cancelledAsync(input, ports);
    case 'failed':
      return failedAsync(input, ports);
    case 'recovery-required':
      return recoveryRequiredAsync(input, ports);
  }
}

type FinishApplyOperationInput =
  | {
      readonly kind: 'completed';
      readonly journal: ApmApplyJournal;
      readonly diagnostics: readonly ApmStatusDiagnostic[];
    }
  | {
      readonly kind: 'cancelled';
      readonly journal: ApmApplyJournal;
      readonly step: ApmPlanStep;
      readonly diagnostics: readonly ApmStatusDiagnostic[];
    }
  | {
      readonly kind: 'failed';
      readonly journal: ApmApplyJournal;
      readonly step: ApmPlanStep;
      readonly failure: ApmApplyFailure;
      readonly diagnostics: readonly ApmStatusDiagnostic[];
    }
  | {
      readonly kind: 'recovery-required';
      readonly journal: ApmApplyJournal;
      readonly step: ApmPlanStep;
      readonly blocker: ApmApplyBlocker;
      readonly diagnostics: readonly ApmStatusDiagnostic[];
    };

/*** Mark an operation completed only after every reviewed/deferred step is committed. */
async function completedAsync(
  input: Extract<FinishApplyOperationInput, { readonly kind: 'completed' }>,
  ports: ApmApplyPorts,
): Promise<ApmApplyRunOutcome> {
  const journal = await persistApplyJournalAsync(
    { kind: 'operation', journal: input.journal, state: 'completed', clearFailure: true },
    ports,
  );
  return { journal, status: 'completed', blockers: [], diagnostics: input.diagnostics };
}

/*** Persist cancellation at the next safe step boundary without losing resumable state. */
async function cancelledAsync(
  input: Extract<FinishApplyOperationInput, { readonly kind: 'cancelled' }>,
  ports: ApmApplyPorts,
): Promise<ApmApplyRunOutcome> {
  const failure = createApplyFailure({ kind: 'cancelled', step: input.step });
  const blocker = createApplyBlocker({ kind: 'cancelled', step: input.step });
  const journal = await persistApplyJournalAsync(
    {
      kind: 'step',
      journal: input.journal,
      step: input.step,
      state: 'cancelled',
      failure,
      journalStatus: 'cancelled',
      operationFailure: failure,
    },
    ports,
  );
  return {
    journal,
    status: 'cancelled',
    blockers: [blocker],
    diagnostics: input.diagnostics,
  };
}

/*** Persist a known failed effect after any permitted rollback has been accounted for. */
async function failedAsync(
  input: Extract<FinishApplyOperationInput, { readonly kind: 'failed' }>,
  ports: ApmApplyPorts,
): Promise<ApmApplyRunOutcome> {
  const blocker = createApplyBlocker({
    kind: 'step-failed',
    step: input.step,
    failure: input.failure,
  });
  const journal = await persistApplyJournalAsync(
    {
      kind: 'step',
      journal: input.journal,
      step: input.step,
      state: 'failed',
      failure: input.failure,
      journalStatus: 'failed',
      operationFailure: input.failure,
    },
    ports,
  );
  return { journal, status: 'failed', blockers: [blocker], diagnostics: input.diagnostics };
}

/*** Persist an ambiguous or unsafe effect as recovery-required rather than guessing. */
async function recoveryRequiredAsync(
  input: Extract<FinishApplyOperationInput, { readonly kind: 'recovery-required' }>,
  ports: ApmApplyPorts,
): Promise<ApmApplyRunOutcome> {
  const failure = createApplyFailure({ kind: 'blocker', blocker: input.blocker });
  const journal = await persistApplyJournalAsync(
    {
      kind: 'step',
      journal: input.journal,
      step: input.step,
      state: 'recovery-required',
      failure,
      journalStatus: 'recovery-required',
      operationFailure: failure,
    },
    ports,
  );
  return {
    journal,
    status: 'recovery-required',
    blockers: [input.blocker],
    diagnostics: input.diagnostics,
  };
}

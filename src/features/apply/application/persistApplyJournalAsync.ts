import type {
  ApmApplyFailure,
  ApmApplyJournal,
  ApmApplyJournalStatus,
  ApmApplyPorts,
  ApmApplyStepState,
} from '../../../types/apply.js';
import type { ApmPlanStep } from '../../../types/plan.js';
import { transitionApplyJournal } from '../domain/transitionApplyJournal.js';

/*** Persist one apply state transition before publishing its optional progress event. */
export async function persistApplyJournalAsync(
  input: PersistApplyJournalInput,
  ports: ApmApplyPorts,
): Promise<ApmApplyJournal> {
  const next = input.kind === 'operation'
    ? operationJournal(input, ports.clock.nowIso())
    : stepJournal(input, ports.clock.nowIso());
  await ports.journal.writeAsync(next);
  await publishProgressAsync(next, input.kind === 'step' ? input.step.id : undefined, input.state, ports);
  return next;
}

type PersistApplyJournalInput = PersistApplyStepInput | PersistApplyOperationInput;

interface PersistApplyStepInput {
  readonly kind: 'step';
  readonly journal: ApmApplyJournal;
  readonly step: ApmPlanStep;
  readonly state: ApmApplyStepState;
  readonly evidence?: readonly string[];
  readonly failure?: ApmApplyFailure;
  readonly incrementAttempts?: boolean;
  readonly clearFailure?: boolean;
  readonly journalStatus?: ApmApplyJournalStatus;
  readonly operationFailure?: ApmApplyFailure;
}

interface PersistApplyOperationInput {
  readonly kind: 'operation';
  readonly journal: ApmApplyJournal;
  readonly state: ApmApplyJournalStatus;
  readonly failure?: ApmApplyFailure;
  readonly clearFailure?: boolean;
}

/*** Apply one immutable step transition before writing the durable journal. */
function stepJournal(input: PersistApplyStepInput, now: string): ApmApplyJournal {
  return transitionApplyJournal({
    journal: input.journal,
    stepId: input.step.id,
    state: input.state,
    now,
    ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
    ...(input.failure === undefined ? {} : { failure: input.failure }),
    ...(input.incrementAttempts === undefined
      ? {}
      : { incrementAttempts: input.incrementAttempts }),
    ...(input.clearFailure === undefined ? {} : { clearFailure: input.clearFailure }),
    ...(input.journalStatus === undefined ? {} : { journalStatus: input.journalStatus }),
    ...(input.operationFailure === undefined
      ? {}
      : { operationFailure: input.operationFailure }),
    clearOperationFailure: input.clearFailure === true,
  });
}

/*** Transition only the enclosing operation status once no individual step transition is needed. */
function operationJournal(input: PersistApplyOperationInput, now: string): ApmApplyJournal {
  const { failure: previousFailure, ...withoutFailure } = input.journal;
  return {
    ...(input.clearFailure === true ? withoutFailure : input.journal),
    status: input.state,
    updatedAt: now,
    ...(input.failure === undefined ? {} : { failure: input.failure }),
  };
}

/*** Publish progress only after the corresponding journal transition is durably written. */
async function publishProgressAsync(
  journal: ApmApplyJournal,
  stepId: string | undefined,
  state: ApmApplyJournalStatus | ApmApplyStepState,
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

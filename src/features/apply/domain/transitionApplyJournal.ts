import type {
  ApmApplyFailure,
  ApmApplyJournal,
  ApmApplyJournalStatus,
  ApmApplyStepState,
} from '../../../types/apply.js';

/*** Immutably transition one apply step and optionally the enclosing operation status. */
export function transitionApplyJournal(input: TransitionApplyJournalInput): ApmApplyJournal {
  const steps = input.journal.steps.map((step) =>
    step.stepId === input.stepId
      ? {
          ...step,
          state: input.state,
          attempts: step.attempts + (input.incrementAttempts === true ? 1 : 0),
          updatedAt: input.now,
          evidence: input.evidence ?? step.evidence,
          ...(input.failure === undefined ? {} : { failure: input.failure }),
        }
      : step,
  );
  return {
    ...input.journal,
    updatedAt: input.now,
    steps,
    ...(input.journalStatus === undefined ? {} : { status: input.journalStatus }),
    ...(input.operationFailure === undefined ? {} : { failure: input.operationFailure }),
  };
}

interface TransitionApplyJournalInput {
  readonly journal: ApmApplyJournal;
  readonly stepId: string;
  readonly state: ApmApplyStepState;
  readonly now: string;
  readonly evidence?: readonly string[];
  readonly failure?: ApmApplyFailure;
  readonly incrementAttempts?: boolean;
  readonly journalStatus?: ApmApplyJournalStatus;
  readonly operationFailure?: ApmApplyFailure;
}

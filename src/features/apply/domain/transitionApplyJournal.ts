import type {
  ApmApplyFailure,
  ApmApplyJournal,
  ApmApplyJournalStatus,
  ApmApplyStepState,
} from '../../../types/apply.js';

/*** Immutably transition one apply step and optionally the enclosing operation status. */
export function transitionApplyJournal(input: TransitionApplyJournalInput): ApmApplyJournal {
  const steps = input.journal.steps.map((step) =>
    step.stepId === input.stepId ? transitionStep(step, input) : step,
  );
  const { failure: _operationFailure, ...journalWithoutFailure } = input.journal;
  return {
    ...(input.clearOperationFailure === true ? journalWithoutFailure : input.journal),
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
  readonly clearFailure?: boolean;
  readonly clearOperationFailure?: boolean;
}

type ApplyStepJournal = ApmApplyJournal['steps'][number];

/*** Transition one immutable step record and optionally clear stale failure evidence. */
function transitionStep(
  step: ApplyStepJournal,
  input: TransitionApplyJournalInput,
): ApplyStepJournal {
  const { failure: _stepFailure, ...stepWithoutFailure } = step;
  return {
    ...(input.clearFailure === true ? stepWithoutFailure : step),
    state: input.state,
    attempts: step.attempts + (input.incrementAttempts === true ? 1 : 0),
    updatedAt: input.now,
    evidence: input.evidence ?? step.evidence,
    ...(input.failure === undefined ? {} : { failure: input.failure }),
  };
}

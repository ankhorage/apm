import type {
  ApmApplyBlocker,
  ApmApplyFailure,
  ApmApplyStepExecutionResult,
  ApmApplyStepObservation,
} from '../../../types/apply.js';
import type { ApmPlanStep } from '../../../types/plan.js';

/*** Build stable machine-readable apply blockers from one explicit execution/recovery condition. */
export function createApplyBlocker(input: CreateApplyBlockerInput): ApmApplyBlocker {
  switch (input.kind) {
    case 'cancelled':
    case 'prerequisite-incomplete':
    case 'precondition-changed':
    case 'journal-step-missing':
      return createStateBlocker(input);
    case 'step-failed':
      return createFailedStepBlocker(input.step, input.failure);
    default:
      return createRecoveryBlocker(input);
  }
}

type CreateApplyBlockerInput =
  ApplyStateBlockerInput | ApplyRecoveryBlockerInput | ApplyFailedInput;

type ApplyStateBlockerInput =
  | { readonly kind: 'cancelled'; readonly step: ApmPlanStep }
  | { readonly kind: 'prerequisite-incomplete'; readonly step: ApmPlanStep }
  | {
      readonly kind: 'precondition-changed';
      readonly step: ApmPlanStep;
      readonly observation: ApmApplyStepObservation;
    }
  | { readonly kind: 'journal-step-missing'; readonly step: ApmPlanStep };

type ApplyRecoveryBlockerInput =
  | {
      readonly kind: 'uncertain-effect';
      readonly step: ApmPlanStep;
      readonly observation: ApmApplyStepObservation;
    }
  | {
      readonly kind: 'unknown-execution';
      readonly step: ApmPlanStep;
      readonly execution: ApmApplyStepExecutionResult;
    }
  | {
      readonly kind: 'output-mismatch';
      readonly step: ApmPlanStep;
      readonly execution: ApmApplyStepExecutionResult;
      readonly observation: ApmApplyStepObservation;
    }
  | {
      readonly kind: 'rollback-failed';
      readonly step: ApmPlanStep;
      readonly execution: ApmApplyStepExecutionResult;
    };

interface ApplyFailedInput {
  readonly kind: 'step-failed';
  readonly step: ApmPlanStep;
  readonly failure: ApmApplyFailure;
}

/*** Classify cancellation, prerequisite and project-precondition journal state failures. */
function createStateBlocker(input: ApplyStateBlockerInput): ApmApplyBlocker {
  switch (input.kind) {
    case 'cancelled':
      return stepBlocker(
        input.step,
        'apply.cancelled',
        [input.step.id],
        'Apply was cancelled at a safe step boundary.',
        'Resume the same operation to continue.',
      );
    case 'prerequisite-incomplete':
      return stepBlocker(
        input.step,
        'apply.prerequisite-incomplete',
        input.step.prerequisites,
        'A reviewed step prerequisite is not durably committed.',
        'Resume from the earliest incomplete prerequisite or inspect the operation journal.',
      );
    case 'precondition-changed':
      return stepBlocker(
        input.step,
        'apply.precondition-changed',
        input.observation.evidence,
        input.observation.reason ??
          'Reviewed step preconditions no longer match the current project state.',
        'Preserve the external edits and create a new plan or reconcile them before resuming.',
      );
    case 'journal-step-missing':
      return stepBlocker(
        input.step,
        'apply.journal-invalid',
        [input.step.id],
        'Durable operation journal does not contain the reviewed plan step.',
        'Do not mutate the project; inspect or restore the operation journal.',
      );
  }
}

/*** Classify ambiguous effects, output mismatches and failed automatic rollback. */
function createRecoveryBlocker(input: ApplyRecoveryBlockerInput): ApmApplyBlocker {
  switch (input.kind) {
    case 'uncertain-effect':
      return stepBlocker(
        input.step,
        'apply.recovery-required',
        input.observation.evidence,
        `Reviewed step ${input.step.id} may have started and is not safely restartable.`,
        'Inspect the step postcondition and follow package-owned recovery guidance before resuming.',
      );
    case 'unknown-execution':
      return stepBlocker(
        input.step,
        'apply.recovery-required',
        input.execution.evidence,
        input.execution.failure?.reason ??
          'Execution result is ambiguous and cannot be committed safely.',
        input.execution.failure?.nextAction ??
          'Resume to inspect the reviewed postcondition before retrying.',
      );
    case 'output-mismatch':
      return stepBlocker(
        input.step,
        'apply.output-mismatch',
        [...input.execution.evidence, ...input.observation.evidence],
        input.observation.reason ??
          'Actual step output does not match the reviewed plan postcondition.',
        'Do not continue; inspect the changed scope and create or resume recovery from this operation.',
      );
    case 'rollback-failed':
      return stepBlocker(
        input.step,
        'apply.recovery-required',
        input.execution.evidence,
        'Automatic rollback could not prove restoration of the reviewed local pre-state.',
        'Use the operation snapshots and recorded evidence for explicit recovery.',
      );
  }
}

/*** Preserve one known adapter failure after any permitted reversible-local rollback. */
function createFailedStepBlocker(step: ApmPlanStep, failure: ApmApplyFailure): ApmApplyBlocker {
  return stepBlocker(
    step,
    'apply.step-failed',
    failure.evidence,
    failure.reason,
    failure.nextAction,
  );
}

/*** Build the common step-scoped blocker representation. */
function stepBlocker(
  step: ApmPlanStep,
  code: ApmApplyBlocker['code'],
  evidence: readonly string[],
  reason: string,
  nextAction: string | undefined,
): ApmApplyBlocker {
  return {
    code,
    scope: { kind: 'step', id: step.id },
    evidence,
    reason,
    ...(nextAction === undefined ? {} : { nextAction }),
  };
}

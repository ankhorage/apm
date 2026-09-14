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
      return {
        code: 'apply.cancelled',
        scope: { kind: 'step', id: input.step.id },
        evidence: [input.step.id],
        reason: 'Apply was cancelled at a safe step boundary.',
        nextAction: 'Resume the same operation to continue.',
      };
    case 'prerequisite-incomplete':
      return {
        code: 'apply.prerequisite-incomplete',
        scope: { kind: 'step', id: input.step.id },
        evidence: input.step.prerequisites,
        reason: 'A reviewed step prerequisite is not durably committed.',
        nextAction:
          'Resume from the earliest incomplete prerequisite or inspect the operation journal.',
      };
    case 'precondition-changed':
      return {
        code: 'apply.precondition-changed',
        scope: { kind: 'step', id: input.step.id },
        evidence: input.observation.evidence,
        reason:
          input.observation.reason ??
          'Reviewed step preconditions no longer match the current project state.',
        nextAction:
          'Preserve the external edits and create a new plan or reconcile them before resuming.',
      };
    case 'journal-step-missing':
      return {
        code: 'apply.journal-invalid',
        scope: { kind: 'step', id: input.step.id },
        evidence: [input.step.id],
        reason: 'Durable operation journal does not contain the reviewed plan step.',
        nextAction: 'Do not mutate the project; inspect or restore the operation journal.',
      };
    case 'uncertain-effect':
      return {
        code: 'apply.recovery-required',
        scope: { kind: 'step', id: input.step.id },
        evidence: input.observation.evidence,
        reason: `Reviewed step ${input.step.id} may have started and is not safely restartable.`,
        nextAction:
          'Inspect the step postcondition and follow package-owned recovery guidance before resuming.',
      };
    case 'unknown-execution':
      return {
        code: 'apply.recovery-required',
        scope: { kind: 'step', id: input.step.id },
        evidence: input.execution.evidence,
        reason:
          input.execution.failure?.reason ??
          'Execution result is ambiguous and cannot be committed safely.',
        nextAction:
          input.execution.failure?.nextAction ??
          'Resume to inspect the reviewed postcondition before retrying.',
      };
    case 'output-mismatch':
      return {
        code: 'apply.output-mismatch',
        scope: { kind: 'step', id: input.step.id },
        evidence: [...input.execution.evidence, ...input.observation.evidence],
        reason:
          input.observation.reason ??
          'Actual step output does not match the reviewed plan postcondition.',
        nextAction:
          'Do not continue; inspect the changed scope and create or resume recovery from this operation.',
      };
    case 'rollback-failed':
      return {
        code: 'apply.recovery-required',
        scope: { kind: 'step', id: input.step.id },
        evidence: input.execution.evidence,
        reason: 'Automatic rollback could not prove restoration of the reviewed local pre-state.',
        nextAction: 'Use the operation snapshots and recorded evidence for explicit recovery.',
      };
    case 'step-failed':
      return {
        code: 'apply.step-failed',
        scope: { kind: 'step', id: input.step.id },
        evidence: input.failure.evidence,
        reason: input.failure.reason,
        ...(input.failure.nextAction === undefined
          ? {}
          : { nextAction: input.failure.nextAction }),
      };
  }
}

type CreateApplyBlockerInput =
  | { readonly kind: 'cancelled'; readonly step: ApmPlanStep }
  | { readonly kind: 'prerequisite-incomplete'; readonly step: ApmPlanStep }
  | {
      readonly kind: 'precondition-changed';
      readonly step: ApmPlanStep;
      readonly observation: ApmApplyStepObservation;
    }
  | { readonly kind: 'journal-step-missing'; readonly step: ApmPlanStep }
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
    }
  | {
      readonly kind: 'step-failed';
      readonly step: ApmPlanStep;
      readonly failure: ApmApplyFailure;
    };

import type {
  ApmApplyBlocker,
  ApmApplyFailure,
  ApmApplyStepExecutionResult,
} from '../../../types/apply.js';
import type { ApmPlanStep } from '../../../types/plan.js';

/*** Build durable journal failure evidence from one explicit apply failure condition. */
export function createApplyFailure(input: CreateApplyFailureInput): ApmApplyFailure {
  switch (input.kind) {
    case 'execution-exception':
      return {
        code: 'apply.execution-exception',
        reason: 'Execution adapter failed without proving whether the reviewed effect completed.',
        evidence: [input.error instanceof Error ? input.error.message : 'unknown adapter failure'],
        nextAction:
          'Resume the operation so APM can inspect the reviewed postcondition before retrying.',
      };
    case 'known-execution':
      return (
        input.execution.failure ?? {
          code: 'apply.step-failed',
          reason: `Reviewed step ${input.step.id} reported a known execution failure.`,
          evidence: input.execution.evidence,
          nextAction:
            'Inspect the recorded evidence, correct the cause, then resume when the step is restartable.',
        }
      );
    case 'blocker':
      return {
        code: input.blocker.code,
        reason: input.blocker.reason,
        evidence: input.blocker.evidence,
        ...(input.blocker.nextAction === undefined ? {} : { nextAction: input.blocker.nextAction }),
      };
    case 'cancelled':
      return {
        code: 'apply.cancelled',
        reason: `Apply was cancelled before reviewed step ${input.step.id} began.`,
        evidence: [input.step.id],
        nextAction: 'Resume the same operation to continue from durable journal state.',
      };
  }
}

type CreateApplyFailureInput =
  | { readonly kind: 'execution-exception'; readonly error: unknown }
  | {
      readonly kind: 'known-execution';
      readonly step: ApmPlanStep;
      readonly execution: ApmApplyStepExecutionResult;
    }
  | { readonly kind: 'blocker'; readonly blocker: ApmApplyBlocker }
  | { readonly kind: 'cancelled'; readonly step: ApmPlanStep };

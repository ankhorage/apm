import type { ApmApplyJournal, ApmApplyStepObservation } from '../../../types/apply.js';
import type { ApmPlanStep } from '../../../types/plan.js';
import { applyStepRecoveryPolicy } from './applyStepRecoveryPolicy.js';

/*** Decide whether an observed reviewed step is already complete, executable, or requires recovery. */
export function decideApplyStepObservation(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  observation: ApmApplyStepObservation,
): ApplyStepObservationDecision {
  if (observation.state === 'satisfied') return { action: 'commit' };
  if (observation.state === 'conflict') return { action: 'recover-precondition' };
  const record = journal.steps.find(({ stepId }) => stepId === step.id);
  if (record === undefined) return { action: 'recover-journal' };
  return effectMayHaveStarted(record.state) && !applyStepRecoveryPolicy(step).restartable
    ? { action: 'recover-uncertain' }
    : { action: 'execute' };
}

type ApplyStepObservationDecision =
  | { readonly action: 'commit' }
  | { readonly action: 'recover-precondition' }
  | { readonly action: 'recover-journal' }
  | { readonly action: 'recover-uncertain' }
  | { readonly action: 'execute' };

/*** Identify durable states where an external effect may already have escaped before interruption. */
function effectMayHaveStarted(state: ApmApplyJournal['steps'][number]['state']): boolean {
  switch (state) {
    case 'effect-started':
    case 'effect-observed':
    case 'failed':
    case 'recovery-required':
      return true;
    default:
      return false;
  }
}

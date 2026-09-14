import type {
  ApmApplyJournal,
  ApmApplyPermissions,
  ApmApplyStepJournal,
} from '../../../types/apply.js';
import type { ApmPlanResult } from '../../../types/plan.js';

/*** Create the durable initial journal for one reviewed plan before any project side effect. */
export function createApplyJournal(
  plan: ApmPlanResult,
  permissions: ApmApplyPermissions,
  operationId: string,
  now: string,
): ApmApplyJournal {
  return {
    schemaVersion: 1,
    operationId,
    rootPath: plan.rootPath,
    plan,
    permissions,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    steps: plan.steps.map((step) => initialStep(step.id, now)),
  };
}

/*** Build one untouched step record without inferring execution from plan evidence. */
function initialStep(stepId: string, now: string): ApmApplyStepJournal {
  return {
    stepId,
    state: 'pending',
    attempts: 0,
    updatedAt: now,
    evidence: [],
  };
}

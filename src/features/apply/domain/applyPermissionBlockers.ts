import type {
  ApmApplyBlocker,
  ApmApplyPermissions,
} from '../../../types/apply.js';
import type { ApmPlanResult, ApmPlanStep } from '../../../types/plan.js';

/*** Return every explicit execution capability required by a reviewed plan but absent from consent. */
export function applyPermissionBlockers(
  plan: ApmPlanResult,
  permissions: ApmApplyPermissions,
): readonly ApmApplyBlocker[] {
  return plan.steps.flatMap((step) => stepPermissionBlockers(step, permissions));
}

/*** Validate one step's executable trust/effect boundary without prompting the caller. */
function stepPermissionBlockers(
  step: ApmPlanStep,
  permissions: ApmApplyPermissions,
): readonly ApmApplyBlocker[] {
  const ownerCode = requiresOwnerCode(step) && !permissions.ownerCode
    ? [permissionBlocker(step, 'owner-code')]
    : [];
  const lifecycle =
    step.execution.kind === 'install' &&
    step.execution.lifecycleScripts &&
    !permissions.lifecycleScripts
      ? [permissionBlocker(step, 'lifecycle-scripts')]
      : [];
  const external = requiresExternalEffects(step) && !permissions.externalEffects
    ? [permissionBlocker(step, 'external-effects')]
    : [];
  return [...ownerCode, ...lifecycle, ...external];
}

/*** Require executable-owner consent only where a migration/projection actually invokes owner code. */
function requiresOwnerCode(step: ApmPlanStep): boolean {
  if (step.execution.kind === 'migration') return true;
  return step.execution.kind === 'projection' && step.execution.descriptor.requiresExtension;
}

/*** Treat external/manual migration side effects as a separately consented capability. */
function requiresExternalEffects(step: ApmPlanStep): boolean {
  return (
    step.execution.kind === 'migration' &&
    step.execution.descriptor.sideEffects.some(
      (effect) => effect === 'external-service' || effect === 'manual',
    )
  );
}

/*** Build stable permission blocker evidence for CLI, Ankh and Studio adapters. */
function permissionBlocker(step: ApmPlanStep, capability: string): ApmApplyBlocker {
  return {
    code: 'apply.permission-required',
    scope: { kind: 'step', id: step.id },
    evidence: [capability],
    reason: `Reviewed step ${step.id} requires explicit ${capability} permission.`,
    nextAction: 'Grant the required execution capability explicitly and retry the same reviewed plan.',
  };
}

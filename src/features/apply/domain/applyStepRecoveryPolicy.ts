import type { ApmPlanStep } from '../../../types/plan.js';

/*** Derive conservative restart/rollback behavior from the reviewed executable step descriptor. */
export function applyStepRecoveryPolicy(step: ApmPlanStep): ApplyStepRecoveryPolicy {
  switch (step.execution.kind) {
    case 'dependency-files':
      return { restartable: true, reversible: true, deferred: false };
    case 'install':
      return { restartable: true, reversible: false, deferred: false };
    case 'migration':
      return {
        restartable:
          step.execution.descriptor.recovery.restartable &&
          step.execution.descriptor.recovery.idempotent,
        reversible:
          step.execution.descriptor.recovery.reversible &&
          !step.execution.descriptor.sideEffects.some(isExternalEffect),
        deferred: false,
      };
    case 'projection':
      return {
        restartable: false,
        reversible: step.execution.descriptor.claims.every(({ kind }) => kind !== 'dynamic'),
        deferred: false,
      };
    case 'validation':
      return { restartable: true, reversible: false, deferred: false };
    case 'host-restart':
    case 'follow-up':
      return { restartable: false, reversible: false, deferred: true };
  }
}

interface ApplyStepRecoveryPolicy {
  readonly restartable: boolean;
  readonly reversible: boolean;
  readonly deferred: boolean;
}

/*** External/manual migration effects are never claimed as transactionally reversible by APM. */
function isExternalEffect(effect: string): boolean {
  return effect === 'external-service' || effect === 'manual';
}

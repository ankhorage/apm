import type { ApmPlanPolicy, ApmPlanPolicyInput } from '../../../types/plan.js';

/*** Canonical conservative defaults for deterministic update planning. */
export function normalizePlanPolicy(input: ApmPlanPolicyInput | undefined): ApmPlanPolicy {
  return {
    dependencyUpdates: input?.dependencyUpdates ?? 'safe',
    selections: input?.selections ?? [],
    repairInstallations: input?.repairInstallations ?? true,
    repairProjections: input?.repairProjections ?? true,
    maxGeneratorIterations: input?.maxGeneratorIterations ?? 4,
  };
}

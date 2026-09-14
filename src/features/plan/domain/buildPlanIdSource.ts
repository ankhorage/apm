import type { ApmPlanResult } from '../../../types/plan.js';

/*** Serialize immutable plan identity while keeping registry freshness outside equivalence semantics. */
export function buildPlanIdSource(
  plan: Omit<ApmPlanResult, 'schemaVersion' | 'operation' | 'id'>,
): string {
  const { inputFingerprint, ...rest } = plan;
  return JSON.stringify({
    ...rest,
    inputFingerprint: {
      value: inputFingerprint.value,
      statusSchemaVersion: inputFingerprint.statusSchemaVersion,
    },
  });
}

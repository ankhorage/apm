import type {
  ApmPlanDigestPort,
  ApmPlanInputFingerprint,
  ApmPlanPolicy,
} from '../../../types/plan.js';
import type { ApmStatusResult } from '../../../types/status.js';
import { buildPlanInputFingerprintSource } from './buildPlanInputFingerprintSource.js';

/*** Create the semantic plan fingerprint while recording registry freshness outside fingerprint validity. */
export async function createPlanInputFingerprintAsync(
  status: ApmStatusResult,
  policy: ApmPlanPolicy,
  digest: ApmPlanDigestPort,
): Promise<ApmPlanInputFingerprint> {
  return {
    value: await digest.digestAsync(buildPlanInputFingerprintSource(status, policy)),
    statusSchemaVersion: status.schemaVersion,
    availabilityCheckedAt: availabilityCheckedAt(status),
  };
}

/*** Collect unique registry freshness timestamps without making them semantic project evidence. */
function availabilityCheckedAt(status: ApmStatusResult): readonly string[] {
  return [
    ...status.dependencies.flatMap(({ availability }) =>
      availability.checkedAt === undefined ? [] : [availability.checkedAt],
    ),
    ...status.hosts.flatMap(({ availability }) =>
      availability.checkedAt === undefined ? [] : [availability.checkedAt],
    ),
  ]
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort(compareText);
}

/*** Compare timestamp strings deterministically without locale-dependent sorting. */
function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

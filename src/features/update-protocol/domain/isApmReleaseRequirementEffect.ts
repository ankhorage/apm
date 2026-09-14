import { isRecord } from '@ankhorage/utility/object';

import type { ApmReleaseRequirementEffect } from '../../../types/update-protocol.js';

/*** Validate one rebuild/redeploy/native/backend/manual release requirement. */
export function isApmReleaseRequirementEffect(
  value: unknown,
): value is ApmReleaseRequirementEffect {
  if (!isRecord(value)) return false;
  const { kind, requirement, evidence, reason } = value;
  return (
    (kind === 'web-rebuild' ||
      kind === 'web-redeploy' ||
      kind === 'native-binary' ||
      kind === 'backend-prerequisite' ||
      kind === 'manual-review') &&
    (requirement === 'required' || requirement === 'not-required' || requirement === 'unknown') &&
    Array.isArray(evidence) &&
    evidence.every((entry) => typeof entry === 'string') &&
    typeof reason === 'string'
  );
}

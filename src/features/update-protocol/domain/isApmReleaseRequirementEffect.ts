import { isRecord } from '@ankhorage/utility/object';

import type { ApmReleaseRequirementEffect } from '../../../types/update-protocol.js';

/*** Validate one rebuild/redeploy/native/backend/manual release requirement. */
export function isApmReleaseRequirementEffect(
  value: unknown,
): value is ApmReleaseRequirementEffect {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  const kind = value.kind;
  const requirement = value.requirement;
  return (
    (kind === 'web-rebuild' ||
      kind === 'web-redeploy' ||
      kind === 'native-binary' ||
      kind === 'backend-prerequisite' ||
      kind === 'manual-review') &&
    (requirement === 'required' || requirement === 'not-required' || requirement === 'unknown') &&
    Array.isArray(value.evidence) &&
    value.evidence.every((entry) => typeof entry === 'string') &&
    typeof value.reason === 'string'
  );
}

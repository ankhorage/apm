import { isRecord } from '@ankhorage/utility/object';

import type { ApmOtaEligibilityEffect } from '../../../types/update-protocol.js';

/*** Validate OTA eligibility metadata from a static update descriptor. */
export function isApmOtaEligibilityEffect(value: unknown): value is ApmOtaEligibilityEffect {
  return (
    isRecord(value) &&
    value.kind === 'ota-eligibility' &&
    (value.eligibility === 'eligible' ||
      value.eligibility === 'not-eligible' ||
      value.eligibility === 'unknown') &&
    Array.isArray(value.evidence) &&
    value.evidence.every((entry) => typeof entry === 'string') &&
    typeof value.reason === 'string'
  );
}

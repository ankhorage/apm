import type { ApmReleaseEffect } from '../../../types/update-protocol.js';
import { isApmOtaEligibilityEffect } from './isApmOtaEligibilityEffect.js';
import { isApmReleaseRequirementEffect } from './isApmReleaseRequirementEffect.js';

/*** Validate any supported release/shipment effect variant. */
export function isApmReleaseEffect(value: unknown): value is ApmReleaseEffect {
  return isApmOtaEligibilityEffect(value) || isApmReleaseRequirementEffect(value);
}

import { isRecord } from '@ankhorage/utility/object';

import type { ApmProjectionDescriptor } from '../../../types/update-protocol.js';
import { isApmProjectScope } from './isApmProjectScope.js';

/*** Validate one projection descriptor from static protocol data. */
export function isApmProjectionDescriptor(value: unknown): value is ApmProjectionDescriptor {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    Array.isArray(value.claims) &&
    value.claims.every(isApmProjectScope) &&
    typeof value.requiresExtension === 'boolean' &&
    (value.reason === undefined || typeof value.reason === 'string')
  );
}

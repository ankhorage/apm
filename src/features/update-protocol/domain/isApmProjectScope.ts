import { isRecord } from '@ankhorage/utility/object';

import type { ApmProjectScope } from '../../../types/update-protocol.js';

/*** Validate one static project ownership scope from untrusted descriptor data. */
export function isApmProjectScope(value: unknown): value is ApmProjectScope {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'file') return typeof value.path === 'string';
  if (value.kind === 'json-pointer') {
    return typeof value.path === 'string' && typeof value.pointer === 'string';
  }
  return value.kind === 'dynamic' && typeof value.scope === 'string';
}

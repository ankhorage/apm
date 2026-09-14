import { isRecord } from '@ankhorage/utility/object';

import type { ApmJsonValue } from '../../../types/update-protocol.js';

/*** Validate serializable JSON values returned by executable protocol handlers. */
export function isApmJsonValue(value: unknown): value is ApmJsonValue {
  if (value === null) return true;
  if (typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isApmJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isApmJsonValue);
}

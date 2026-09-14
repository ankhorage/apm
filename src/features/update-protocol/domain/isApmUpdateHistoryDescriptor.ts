import { isRecord } from '@ankhorage/utility/object';

import type { ApmUpdateHistoryDescriptor } from '../../../types/update-protocol.js';

/*** Validate supported/unsupported owner history declarations from static descriptor data. */
export function isApmUpdateHistoryDescriptor(value: unknown): value is ApmUpdateHistoryDescriptor {
  if (!isRecord(value) || !Array.isArray(value.supported) || !Array.isArray(value.unsupported)) {
    return false;
  }
  if (value.downgrade !== 'unsupported' && value.downgrade !== 'manual') return false;
  return value.supported.every(isSupportedHistory) && value.unsupported.every(isUnsupportedHistory);
}

/*** Validate one supported source-history declaration. */
function isSupportedHistory(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.sourceRange === 'string' &&
    (value.stateRevision === undefined || typeof value.stateRevision === 'string') &&
    (value.mode === 'automatic' || value.mode === 'no-migration')
  );
}

/*** Validate one explicitly unsupported source-history declaration. */
function isUnsupportedHistory(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.sourceRange === 'string' &&
    typeof value.reason === 'string' &&
    (value.nextAction === undefined || typeof value.nextAction === 'string')
  );
}

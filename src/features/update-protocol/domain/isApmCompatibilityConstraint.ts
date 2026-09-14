import { isRecord } from '@ankhorage/utility/object';

import type { ApmCompatibilityConstraint } from '../../../types/update-protocol.js';

/*** Validate one package/runtime compatibility constraint from static descriptor data. */
export function isApmCompatibilityConstraint(value: unknown): value is ApmCompatibilityConstraint {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  const kind = value.kind;
  return (
    (kind === 'package' || kind === 'node' || kind === 'host' || kind === 'framework') &&
    typeof value.name === 'string' &&
    typeof value.range === 'string' &&
    (value.reason === undefined || typeof value.reason === 'string')
  );
}

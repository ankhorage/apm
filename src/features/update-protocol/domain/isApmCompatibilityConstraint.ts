import { isRecord } from '@ankhorage/utility/object';

import type { ApmCompatibilityConstraint } from '../../../types/update-protocol.js';

/*** Validate one package/runtime compatibility constraint from static descriptor data. */
export function isApmCompatibilityConstraint(value: unknown): value is ApmCompatibilityConstraint {
  if (!isRecord(value)) return false;
  const { kind, name, range, reason } = value;
  return (
    (kind === 'package' || kind === 'node' || kind === 'host' || kind === 'framework') &&
    typeof name === 'string' &&
    typeof range === 'string' &&
    (reason === undefined || typeof reason === 'string')
  );
}

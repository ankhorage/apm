import { isRecord } from '@ankhorage/utility/object';

import type { ApmUpdateExtension } from '../../../types/update-extension.js';

/*** Validate a loaded executable owner extension before APM invokes any capability. */
export function isApmUpdateExtension(value: unknown): value is ApmUpdateExtension {
  if (!isRecord(value)) return false;
  const { protocolVersion, descriptorDigest, migrations, projections } = value;
  return (
    protocolVersion === 1 &&
    typeof descriptorDigest === 'string' &&
    Array.isArray(migrations) &&
    migrations.every(isMigrationHandler) &&
    Array.isArray(projections) &&
    projections.every(isProjectionHandler)
  );
}

/*** Validate one executable migration handler boundary without running its code. */
function isMigrationHandler(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { id, planAsync, executeAsync, verifyAsync } = value;
  return (
    typeof id === 'string' &&
    typeof planAsync === 'function' &&
    typeof executeAsync === 'function' &&
    typeof verifyAsync === 'function'
  );
}

/*** Validate one executable projection handler boundary without running its code. */
function isProjectionHandler(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { id, inspectAsync, planAsync, materializeAsync, verifyAsync } = value;
  return (
    typeof id === 'string' &&
    typeof inspectAsync === 'function' &&
    typeof planAsync === 'function' &&
    typeof materializeAsync === 'function' &&
    typeof verifyAsync === 'function'
  );
}

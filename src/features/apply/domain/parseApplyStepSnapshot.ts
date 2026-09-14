import { isRecord } from '@ankhorage/utility/object';

import type { ApmApplyFileSnapshot, ApmApplyStepSnapshot } from '../../../types/apply-storage.js';

/*** Parse one durable recovery snapshot without trusting filesystem JSON shape. */
export function parseApplyStepSnapshot(value: unknown): ApmApplyStepSnapshot | undefined {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.stepId !== 'string' ||
    !Array.isArray(value.files) ||
    !value.files.every(isApplyFileSnapshot)
  ) {
    return undefined;
  }
  return { schemaVersion: 1, stepId: value.stepId, files: value.files };
}

/*** Validate one serialized raw-file snapshot entry. */
function isApplyFileSnapshot(value: unknown): value is ApmApplyFileSnapshot {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    typeof value.exists === 'boolean' &&
    (value.contentBase64 === undefined || typeof value.contentBase64 === 'string') &&
    (value.exists || value.contentBase64 === undefined)
  );
}

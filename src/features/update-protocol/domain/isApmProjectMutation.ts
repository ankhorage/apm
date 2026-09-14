import { isRecord } from '@ankhorage/utility/object';

import type { ApmProjectMutation } from '../../../types/update-extension.js';
import { isApmJsonValue } from './isApmJsonValue.js';
import { isApmProjectScope } from './isApmProjectScope.js';

/*** Validate one mutation returned by executable owner code before it can enter a reviewed plan. */
export function isApmProjectMutation(value: unknown): value is ApmProjectMutation {
  if (!isRecord(value) || typeof value.id !== 'string' || !isApmProjectScope(value.claim)) {
    return false;
  }
  if (value.kind === 'write-file') return isWriteFileMutation(value);
  if (value.kind === 'delete-file') return isDeleteFileMutation(value);
  if (value.kind === 'set-json-pointer') return isSetJsonPointerMutation(value);
  return value.kind === 'remove-json-pointer' && isRemoveJsonPointerMutation(value);
}

/*** Validate a whole-file write mutation. */
function isWriteFileMutation(value: Readonly<Record<string, unknown>>): boolean {
  return (
    typeof value.path === 'string' &&
    (value.encoding === 'utf8' || value.encoding === 'base64') &&
    typeof value.content === 'string' &&
    optionalString(value.expectedBeforeDigest) &&
    typeof value.afterDigest === 'string'
  );
}

/*** Validate a whole-file delete mutation. */
function isDeleteFileMutation(value: Readonly<Record<string, unknown>>): boolean {
  return typeof value.path === 'string' && optionalString(value.expectedBeforeDigest);
}

/*** Validate a structured JSON-pointer write mutation. */
function isSetJsonPointerMutation(value: Readonly<Record<string, unknown>>): boolean {
  return (
    typeof value.path === 'string' &&
    typeof value.pointer === 'string' &&
    isApmJsonValue(value.value) &&
    optionalString(value.expectedBeforeDigest) &&
    optionalString(value.afterDigest)
  );
}

/*** Validate a structured JSON-pointer removal mutation. */
function isRemoveJsonPointerMutation(value: Readonly<Record<string, unknown>>): boolean {
  return (
    typeof value.path === 'string' &&
    typeof value.pointer === 'string' &&
    optionalString(value.expectedBeforeDigest) &&
    optionalString(value.afterDigest)
  );
}

/*** Validate exact-optional string fields without widening them to explicit undefined. */
function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

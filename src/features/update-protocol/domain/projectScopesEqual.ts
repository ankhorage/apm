import type { ApmProjectScope } from '../../../types/update-protocol.js';

/*** Compare two static ownership scopes without widening file/field ownership. */
export function projectScopesEqual(left: ApmProjectScope, right: ApmProjectScope): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'dynamic') return right.kind === 'dynamic' && left.scope === right.scope;
  if (right.kind === 'dynamic' || left.path !== right.path) return false;
  if (left.kind === 'file') return right.kind === 'file';
  return right.kind === 'json-pointer' && left.pointer === right.pointer;
}

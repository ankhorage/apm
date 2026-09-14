import type { ApmProjectMutation } from '../../../types/update-extension.js';
import type { ApmProjectScope } from '../../../types/update-protocol.js';

/*** Verify that one reviewed mutation cannot escape the ownership scope it attributes itself to. */
export function mutationFitsClaim(mutation: ApmProjectMutation, claim: ApmProjectScope): boolean {
  if (claim.kind === 'dynamic') return mutation.claim.kind === 'dynamic' && mutation.claim.scope === claim.scope;
  if (mutation.path !== claim.path) return false;
  if (claim.kind === 'file') return mutation.claim.kind === 'file';
  if (mutation.claim.kind !== 'json-pointer' || mutation.claim.pointer !== claim.pointer) return false;
  if (mutation.kind !== 'set-json-pointer' && mutation.kind !== 'remove-json-pointer') return false;
  return pointerInsideClaim(mutation.pointer, claim.pointer);
}

/*** Treat an equal pointer or descendant pointer as contained by a structured ownership claim. */
function pointerInsideClaim(pointer: string, claimPointer: string): boolean {
  if (claimPointer === '') return true;
  return pointer === claimPointer || pointer.startsWith(`${claimPointer}/`);
}

import type { ApmProjectScope, ApmUpdateDescriptor } from '../../../types/update-protocol.js';
import type { ApmUpdateProtocolBlocker } from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';

/*** Validate projection identities, extension requirements and static ownership conflicts. */
export function validateProjectionDescriptors(
  descriptor: ApmUpdateDescriptor,
  relatedDescriptors: readonly ApmUpdateDescriptor[] = [],
): readonly ApmUpdateProtocolBlocker[] {
  return [
    ...duplicateProjectionIds(descriptor),
    ...projectionExtensionBlockers(descriptor),
    ...ownershipConflictBlockers([descriptor, ...relatedDescriptors]),
  ];
}

type ProjectionClaim = {
  readonly owner: string;
  readonly projectionId: string;
  readonly scope: ApmProjectScope;
};

/*** Reject duplicate projection IDs within one immutable owner artifact. */
function duplicateProjectionIds(descriptor: ApmUpdateDescriptor): readonly ApmUpdateProtocolBlocker[] {
  const ids = descriptor.projections.map((projection) => projection.id);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  return duplicates.map((id) =>
    createProtocolBlocker({
      code: 'protocol.duplicate-projection-id',
      kind: 'projection',
      id,
      evidence: [id],
      reason: `Projection ID ${id} is declared more than once by ${descriptor.owner.name}.`,
    }),
  );
}

/*** Require a public owner extension whenever a projection says executable generation is required. */
function projectionExtensionBlockers(
  descriptor: ApmUpdateDescriptor,
): readonly ApmUpdateProtocolBlocker[] {
  const required = descriptor.projections.filter((projection) => projection.requiresExtension);
  return required.length > 0 && descriptor.extension === undefined
    ? [
        createProtocolBlocker({
          code: 'protocol.extension-required',
          kind: 'extension',
          evidence: required.map((projection) => projection.id),
          reason: 'Executable projection metadata requires a public owner extension.',
        }),
      ]
    : [];
}

/*** Compare all selected owners and report overlapping claims between distinct projections. */
function ownershipConflictBlockers(
  descriptors: readonly ApmUpdateDescriptor[],
): readonly ApmUpdateProtocolBlocker[] {
  const claims = descriptors.flatMap((descriptor) =>
    descriptor.projections.flatMap((projection) =>
      projection.claims.map((scope) => ({
        owner: descriptor.owner.name,
        projectionId: projection.id,
        scope,
      })),
    ),
  );
  return claims.flatMap((claim, index) =>
    claims.slice(index + 1).flatMap((other) =>
      projectionIdentity(claim) !== projectionIdentity(other) && scopesOverlap(claim.scope, other.scope)
        ? [ownershipConflict(claim, other)]
        : [],
    ),
  );
}

/*** Build one stable owner-scoped projection identity. */
function projectionIdentity(claim: ProjectionClaim): string {
  return `${claim.owner}:${claim.projectionId}`;
}

/*** Determine whether two static ownership claims overlap. */
function scopesOverlap(left: ApmProjectScope, right: ApmProjectScope): boolean {
  if (left.kind === 'dynamic' || right.kind === 'dynamic') {
    return left.kind === 'dynamic' && right.kind === 'dynamic' && left.scope === right.scope;
  }
  if (left.path !== right.path) return false;
  if (left.kind === 'file' || right.kind === 'file') return true;
  return pointersOverlap(left.pointer, right.pointer);
}

/*** Treat equal, root or ancestor JSON pointers as overlapping structured ownership. */
function pointersOverlap(left: string, right: string): boolean {
  if (left === right || left === '' || right === '') return true;
  return right.startsWith(`${left}/`) || left.startsWith(`${right}/`);
}

/*** Build structured evidence for one ownership conflict. */
function ownershipConflict(
  left: ProjectionClaim,
  right: ProjectionClaim,
): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.projection-ownership-conflict',
    kind: 'projection',
    id: projectionIdentity(left),
    evidence: [projectionIdentity(left), projectionIdentity(right), scopeEvidence(left.scope)],
    reason: 'Distinct projections claim overlapping generated project state.',
    nextAction: 'Narrow or transfer ownership explicitly before publishing these descriptors.',
  });
}

/*** Serialize one ownership scope into compact diagnostic evidence. */
function scopeEvidence(scope: ApmProjectScope): string {
  if (scope.kind === 'dynamic') return `dynamic:${scope.scope}`;
  if (scope.kind === 'file') return `file:${scope.path}`;
  return `json:${scope.path}#${scope.pointer}`;
}

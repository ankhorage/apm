import { isRecord } from '@ankhorage/utility/object';

import type { ApmMigrationDescriptor } from '../../../types/update-protocol.js';
import { isApmProjectScope } from './isApmProjectScope.js';

/*** Validate one migration descriptor from untrusted static protocol data. */
export function isApmMigrationDescriptor(value: unknown): value is ApmMigrationDescriptor {
  if (!isRecord(value)) return false;
  const {
    id,
    checksum,
    from,
    to,
    phase,
    implementation,
    prerequisites,
    affectedScopes,
    sideEffects,
    verification,
    recovery,
  } = value;
  return (
    typeof id === 'string' &&
    typeof checksum === 'string' &&
    isMigrationSource(from) &&
    isMigrationTarget(to) &&
    isMigrationExecutionMetadata(phase, implementation, recovery) &&
    isMigrationCollections(prerequisites, affectedScopes, sideEffects, verification)
  );
}

/*** Validate phase, implementation artifact and recovery semantics for one migration. */
function isMigrationExecutionMetadata(
  phase: unknown,
  implementation: unknown,
  recovery: unknown,
): boolean {
  return (
    (phase === 'pre-install' || phase === 'post-install') &&
    isMigrationImplementation(implementation) &&
    isRecoveryDescriptor(recovery)
  );
}

/*** Validate list-valued migration metadata independently from edge/execution identity. */
function isMigrationCollections(
  prerequisites: unknown,
  affectedScopes: unknown,
  sideEffects: unknown,
  verification: unknown,
): boolean {
  return (
    Array.isArray(prerequisites) &&
    prerequisites.every(isMigrationPrerequisite) &&
    Array.isArray(affectedScopes) &&
    affectedScopes.every(isApmProjectScope) &&
    Array.isArray(sideEffects) &&
    sideEffects.every(isMigrationSideEffect) &&
    Array.isArray(verification) &&
    verification.every(isVerificationRequirement)
  );
}

/*** Validate the source side of a migration edge. */
function isMigrationSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.packageRange === 'string' &&
    (value.stateRevision === undefined || typeof value.stateRevision === 'string')
  );
}

/*** Validate the deterministic target side of a migration edge. */
function isMigrationTarget(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.packageVersion === 'string' &&
    (value.stateRevision === undefined || typeof value.stateRevision === 'string')
  );
}

/*** Validate which immutable owner artifact supplies migration code. */
function isMigrationImplementation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { artifact, version } = value;
  return (
    (artifact === 'source' || artifact === 'target' || artifact === 'intermediate') &&
    (version === undefined || typeof version === 'string')
  );
}

/*** Validate one cross-package migration prerequisite reference. */
function isMigrationPrerequisite(value: unknown): boolean {
  return (
    isRecord(value) && typeof value.owner === 'string' && typeof value.migrationId === 'string'
  );
}

/*** Validate one declared migration side-effect classification. */
function isMigrationSideEffect(value: unknown): boolean {
  return (
    value === 'project-files' ||
    value === 'package-manifest' ||
    value === 'package-installation' ||
    value === 'external-service' ||
    value === 'manual'
  );
}

/*** Validate one migration verification requirement. */
function isVerificationRequirement(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.kind === 'extension' || value.kind === 'manual') &&
    (value.key === undefined || typeof value.key === 'string') &&
    typeof value.description === 'string'
  );
}

/*** Validate migration restart/idempotency/reversibility metadata. */
function isRecoveryDescriptor(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.idempotent === 'boolean' &&
    typeof value.restartable === 'boolean' &&
    typeof value.reversible === 'boolean' &&
    (value.reverseMigrationId === undefined || typeof value.reverseMigrationId === 'string')
  );
}

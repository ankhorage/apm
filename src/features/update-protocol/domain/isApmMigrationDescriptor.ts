import { isRecord } from '@ankhorage/utility/object';

import type { ApmMigrationDescriptor } from '../../../types/update-protocol.js';
import { isApmProjectScope } from './isApmProjectScope.js';

/*** Validate one migration descriptor from untrusted static protocol data. */
export function isApmMigrationDescriptor(value: unknown): value is ApmMigrationDescriptor {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.checksum === 'string' &&
    isMigrationSource(value.from) &&
    isMigrationTarget(value.to) &&
    (value.phase === 'pre-install' || value.phase === 'post-install') &&
    isMigrationImplementation(value.implementation) &&
    Array.isArray(value.prerequisites) &&
    value.prerequisites.every(isMigrationPrerequisite) &&
    Array.isArray(value.affectedScopes) &&
    value.affectedScopes.every(isApmProjectScope) &&
    Array.isArray(value.sideEffects) &&
    value.sideEffects.every(isMigrationSideEffect) &&
    Array.isArray(value.verification) &&
    value.verification.every(isVerificationRequirement) &&
    isRecoveryDescriptor(value.recovery)
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
  return (
    isRecord(value) &&
    (value.artifact === 'source' || value.artifact === 'target' || value.artifact === 'intermediate') &&
    (value.version === undefined || typeof value.version === 'string')
  );
}

/*** Validate one cross-package migration prerequisite reference. */
function isMigrationPrerequisite(value: unknown): boolean {
  return isRecord(value) && typeof value.owner === 'string' && typeof value.migrationId === 'string';
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

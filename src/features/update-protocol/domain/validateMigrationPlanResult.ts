import { isRecord } from '@ankhorage/utility/object';

import type {
  ApmMigrationPlanResult,
  ApmProjectMutation,
} from '../../../types/update-extension.js';
import type { ApmMigrationDescriptor } from '../../../types/update-protocol.js';
import type { ApmUpdateProtocolBlocker } from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';
import { isApmProjectMutation } from './isApmProjectMutation.js';
import { mutationFitsClaim } from './mutationFitsClaim.js';
import { projectScopesEqual } from './projectScopesEqual.js';

interface MigrationPlanValidationResult {
  readonly plan?: ApmMigrationPlanResult;
  readonly blockers: readonly ApmUpdateProtocolBlocker[];
}

/*** Validate one runtime migration plan result before it becomes reviewable APM evidence. */
export function validateMigrationPlanResult(
  migration: ApmMigrationDescriptor,
  value: unknown,
): MigrationPlanValidationResult {
  if (!isMigrationPlanResult(value)) return { blockers: [invalidPlanResult(migration.id)] };
  const blockers = [
    ...migrationIdentityBlockers(migration, value),
    ...mutationIdentityBlockers(migration, value.mutations),
    ...mutationOwnershipBlockers(migration, value.mutations),
  ];
  return { ...(blockers.length === 0 ? { plan: value } : {}), blockers };
}

/*** Narrow executable handler output to the serializable migration plan result contract. */
function isMigrationPlanResult(value: unknown): value is ApmMigrationPlanResult {
  if (!isRecord(value)) return false;
  const { migrationId, mutations, evidence, inputFingerprint } = value;
  return (
    typeof migrationId === 'string' &&
    Array.isArray(mutations) &&
    mutations.every(isApmProjectMutation) &&
    Array.isArray(evidence) &&
    evidence.every((entry) => typeof entry === 'string') &&
    typeof inputFingerprint === 'string'
  );
}

/*** Require the runtime plan to bind itself to the exact migration and a concrete input fingerprint. */
function migrationIdentityBlockers(
  migration: ApmMigrationDescriptor,
  plan: ApmMigrationPlanResult,
): readonly ApmUpdateProtocolBlocker[] {
  return [
    ...(plan.migrationId === migration.id
      ? []
      : [invalidResult(migration.id, `migrationId:${plan.migrationId}`)]),
    ...(plan.inputFingerprint.trim() === ''
      ? [invalidResult(migration.id, 'empty input fingerprint')]
      : []),
  ];
}

/*** Require stable, unique, non-empty mutation identities inside one reviewed plan. */
function mutationIdentityBlockers(
  migration: ApmMigrationDescriptor,
  mutations: readonly ApmProjectMutation[],
): readonly ApmUpdateProtocolBlocker[] {
  const ids = mutations.map((mutation) => mutation.id);
  const invalidIds = ids.filter((id) => id.trim() === '');
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  return [...invalidIds, ...duplicateIds].map((id) =>
    invalidResult(migration.id, id === '' ? 'empty mutation ID' : `duplicate mutation ID:${id}`),
  );
}

/*** Ensure every planned mutation attributes itself to and stays within declared owner scope. */
function mutationOwnershipBlockers(
  migration: ApmMigrationDescriptor,
  mutations: readonly ApmProjectMutation[],
): readonly ApmUpdateProtocolBlocker[] {
  return mutations.flatMap((mutation) => {
    const declared = migration.affectedScopes.find((scope) =>
      projectScopesEqual(scope, mutation.claim),
    );
    if (declared === undefined) {
      return [invalidResult(migration.id, `undeclared claim:${mutation.id}`)];
    }
    return mutationFitsClaim(mutation, declared)
      ? []
      : [invalidResult(migration.id, `mutation escapes claim:${mutation.id}`)];
  });
}

/*** Reject malformed executable plan output before it can become typed/reviewable state. */
function invalidPlanResult(migrationId: string): ApmUpdateProtocolBlocker {
  return invalidResult(migrationId, 'malformed plan result');
}

/*** Build one structured invalid extension-result blocker. */
function invalidResult(migrationId: string, evidence: string): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.extension-result-invalid',
    kind: 'extension',
    id: migrationId,
    evidence: [evidence],
    reason: 'Migration extension returned a result that violates the reviewed protocol contract.',
  });
}

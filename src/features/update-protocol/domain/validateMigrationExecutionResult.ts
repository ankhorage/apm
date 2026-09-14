import { isRecord } from '@ankhorage/utility/object';

import type {
  ApmMigrationExecutionResult,
  ApmMigrationPlanResult,
} from '../../../types/update-extension.js';
import type { ApmMigrationDescriptor } from '../../../types/update-protocol.js';
import type { ApmUpdateProtocolBlocker } from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';

interface MigrationExecutionValidationResult {
  readonly execution?: ApmMigrationExecutionResult;
  readonly blockers: readonly ApmUpdateProtocolBlocker[];
}

/*** Validate runtime migration execution evidence against the exact reviewed mutation plan. */
export function validateMigrationExecutionResult(
  migration: ApmMigrationDescriptor,
  plan: ApmMigrationPlanResult,
  value: unknown,
): MigrationExecutionValidationResult {
  if (!isMigrationExecutionResult(value)) return { blockers: [invalidResult(migration.id, 'malformed execution result')] };
  const blockers = [
    ...(value.migrationId === migration.id
      ? []
      : [invalidResult(migration.id, `migrationId:${value.migrationId}`)]),
    ...appliedMutationBlockers(migration.id, plan, value),
  ];
  return { ...(blockers.length === 0 ? { execution: value } : {}), blockers };
}

/*** Narrow runtime handler output to the serializable migration execution contract. */
function isMigrationExecutionResult(value: unknown): value is ApmMigrationExecutionResult {
  if (!isRecord(value)) return false;
  const { migrationId, appliedMutationIds, evidence } = value;
  return (
    typeof migrationId === 'string' &&
    Array.isArray(appliedMutationIds) &&
    appliedMutationIds.every((entry) => typeof entry === 'string') &&
    Array.isArray(evidence) &&
    evidence.every((entry) => typeof entry === 'string')
  );
}

/*** Reject duplicate or unreviewed mutation IDs reported by executable migration code. */
function appliedMutationBlockers(
  migrationId: string,
  plan: ApmMigrationPlanResult,
  execution: ApmMigrationExecutionResult,
): readonly ApmUpdateProtocolBlocker[] {
  const reviewed = new Set(plan.mutations.map((mutation) => mutation.id));
  const duplicate = execution.appliedMutationIds.filter(
    (id, index, ids) => ids.indexOf(id) !== index,
  );
  const unreviewed = execution.appliedMutationIds.filter((id) => !reviewed.has(id));
  return [
    ...new Set([...duplicate.map((id) => `duplicate:${id}`), ...unreviewed.map((id) => `unreviewed:${id}`)]),
  ].map((evidence) => invalidResult(migrationId, evidence));
}

/*** Build one structured invalid execution-result blocker. */
function invalidResult(migrationId: string, evidence: string): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.extension-result-invalid',
    kind: 'extension',
    id: migrationId,
    evidence: [evidence],
    reason: 'Migration execution returned evidence outside the exact reviewed plan contract.',
  });
}

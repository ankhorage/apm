import { valid, validRange } from 'semver';

import type { ApmUpdateDescriptor } from '../../../types/update-protocol.js';
import type { ApmUpdateProtocolBlocker } from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';

/*** Validate local migration IDs, version edges, artifact roles, recovery and checksum history. */
export function validateMigrationDescriptors(
  descriptor: ApmUpdateDescriptor,
  previousDescriptors: readonly ApmUpdateDescriptor[] = [],
): readonly ApmUpdateProtocolBlocker[] {
  return [
    ...duplicateMigrationIds(descriptor),
    ...descriptor.migrations.flatMap(validateMigrationSemantics),
    ...changedMigrationChecksums(descriptor, previousDescriptors),
    ...migrationExtensionBlockers(descriptor),
  ];
}

/*** Reject duplicate migration IDs inside one immutable owner descriptor. */
function duplicateMigrationIds(descriptor: ApmUpdateDescriptor): readonly ApmUpdateProtocolBlocker[] {
  const ids = descriptor.migrations.map((migration) => migration.id);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  return duplicates.map((id) =>
    createProtocolBlocker({
      code: 'protocol.duplicate-migration-id',
      kind: 'migration',
      id,
      evidence: [id],
      reason: `Migration ID ${id} is declared more than once by ${descriptor.owner.name}.`,
    }),
  );
}

/*** Validate one migration's deterministic source/target and recovery declarations. */
function validateMigrationSemantics(
  migration: ApmUpdateDescriptor['migrations'][number],
): readonly ApmUpdateProtocolBlocker[] {
  return [
    ...(validRange(migration.from.packageRange) === null
      ? [invalidMigrationRange(migration.id, migration.from.packageRange)]
      : []),
    ...(valid(migration.to.packageVersion) === null
      ? [invalidMigrationTarget(migration.id, migration.to.packageVersion)]
      : []),
    ...implementationVersionBlockers(migration),
    ...reversibilityBlockers(migration),
  ];
}

/*** Validate intermediate artifact selection without leaking runtime resolution into metadata. */
function implementationVersionBlockers(
  migration: ApmUpdateDescriptor['migrations'][number],
): readonly ApmUpdateProtocolBlocker[] {
  const implementation = migration.implementation;
  if (implementation.artifact === 'intermediate' && implementation.version === undefined) {
    return [
      createProtocolBlocker({
        code: 'protocol.intermediate-version-required',
        kind: 'migration',
        id: migration.id,
        evidence: [implementation.artifact],
        reason: 'Intermediate migration code requires an exact historical package version.',
      }),
    ];
  }
  if (implementation.artifact !== 'intermediate' && implementation.version !== undefined) {
    return [
      createProtocolBlocker({
        code: 'protocol.intermediate-version-unexpected',
        kind: 'migration',
        id: migration.id,
        evidence: [implementation.version],
        reason: 'Source/target artifact roles derive their version from the reviewed update context.',
      }),
    ];
  }
  return implementation.version !== undefined && valid(implementation.version) === null
    ? [invalidMigrationTarget(migration.id, implementation.version)]
    : [];
}

/*** Require an explicit reverse migration identity before claiming reversibility. */
function reversibilityBlockers(
  migration: ApmUpdateDescriptor['migrations'][number],
): readonly ApmUpdateProtocolBlocker[] {
  return migration.recovery.reversible && migration.recovery.reverseMigrationId === undefined
    ? [
        createProtocolBlocker({
          code: 'protocol.reversible-migration-missing-reverse',
          kind: 'migration',
          id: migration.id,
          evidence: [migration.id],
          reason: 'A reversible migration must name the reverse migration that proves rollback.',
        }),
      ]
    : [];
}

/*** Reject stable migration identities whose implementation checksum changed in later artifacts. */
function changedMigrationChecksums(
  descriptor: ApmUpdateDescriptor,
  previousDescriptors: readonly ApmUpdateDescriptor[],
): readonly ApmUpdateProtocolBlocker[] {
  const previous = previousDescriptors.filter((item) => item.owner.name === descriptor.owner.name);
  return descriptor.migrations.flatMap((migration) =>
    previous.flatMap((item) =>
      item.migrations.flatMap((historic) =>
        historic.id === migration.id && historic.checksum !== migration.checksum
          ? [checksumChanged(descriptor.owner.name, migration.id, historic.checksum, migration.checksum)]
          : [],
      ),
    ),
  );
}

/*** Require executable owner entrypoints when real migrations are declared. */
function migrationExtensionBlockers(
  descriptor: ApmUpdateDescriptor,
): readonly ApmUpdateProtocolBlocker[] {
  return descriptor.migrations.length > 0 && descriptor.extension === undefined
    ? [
        createProtocolBlocker({
          code: 'protocol.extension-required',
          kind: 'extension',
          evidence: descriptor.migrations.map((migration) => migration.id),
          reason: 'Migration metadata requires a public executable owner extension.',
        }),
      ]
    : [];
}

/*** Build an invalid source-range blocker for one migration. */
function invalidMigrationRange(id: string, range: string): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.invalid-version-range',
    kind: 'migration',
    id,
    evidence: [range],
    reason: `Migration source range ${range} is not valid semantic-version syntax.`,
  });
}

/*** Build an invalid exact target/intermediate version blocker. */
function invalidMigrationTarget(id: string, version: string): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.invalid-version-range',
    kind: 'migration',
    id,
    evidence: [version],
    reason: `Migration package version ${version} is not an exact semantic version.`,
  });
}

/*** Build immutable migration-history checksum evidence. */
function checksumChanged(
  owner: string,
  id: string,
  previous: string,
  current: string,
): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.migration-checksum-changed',
    kind: 'migration',
    id,
    evidence: [owner, previous, current],
    reason: `Migration ${owner}:${id} changed checksum after its stable identity was published.`,
    nextAction: 'Publish the changed behavior under a new migration ID.',
  });
}

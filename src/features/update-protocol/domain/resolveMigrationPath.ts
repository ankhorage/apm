import { compare, satisfies, valid, validRange } from 'semver';

import type {
  ApmMigrationDescriptor,
  ApmSupportedSourceHistory,
} from '../../../types/update-protocol.js';
import type {
  ApmCompletedMigrationEvidence,
  ApmMigrationPathInput,
  ApmMigrationPathResult,
  ApmUpdateProtocolBlocker,
} from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';

/*** Resolve one complete deterministic owner migration path for an exact source and target. */
export function resolveMigrationPath(input: ApmMigrationPathInput): ApmMigrationPathResult {
  const syntaxBlockers = pathSyntaxBlockers(input);
  if (syntaxBlockers.length > 0) return unsupportedPath(syntaxBlockers);
  if (input.targetVersion !== input.descriptor.owner.version) {
    return unsupportedPath([targetOwnerMismatch(input)]);
  }
  if (compare(input.targetVersion, input.sourceVersion) < 0) {
    return unsupportedPath([downgradeBlocker(input)]);
  }
  const completedBlockers = completedMigrationBlockers(input);
  if (completedBlockers.length > 0) return unsupportedPath(completedBlockers);
  const history = matchingHistory(input);
  if (history.length !== 1) return unsupportedPath(historySelectionBlockers(input, history));
  const [selectedHistory] = history;
  if (selectedHistory === undefined) return unsupportedPath([unsupportedHistory(input)]);
  if (selectedHistory.mode === 'no-migration') return noMigrationPath();
  const paths = migrationPaths(input);
  if (paths.length === 1) return supportedPath(paths[0] ?? []);
  return unsupportedPath([migrationPathBlocker(input, paths.length)]);
}

interface MigrationState {
  readonly version: string;
  readonly stateRevision?: string;
  readonly completedMigrations: readonly ApmCompletedMigrationEvidence[];
  readonly migrations: readonly ApmMigrationDescriptor[];
}

/*** Validate exact source/target version syntax before graph traversal. */
function pathSyntaxBlockers(input: ApmMigrationPathInput): readonly ApmUpdateProtocolBlocker[] {
  return [input.sourceVersion, input.targetVersion].flatMap((version) =>
    valid(version) === null
      ? [
          createProtocolBlocker({
            code: 'protocol.invalid-version-range',
            kind: 'history',
            evidence: [version],
            reason: `Migration path version ${version} is not an exact semantic version.`,
          }),
        ]
      : [],
  );
}

/*** Reject completed-history evidence that disagrees with a known immutable migration checksum. */
function completedMigrationBlockers(
  input: ApmMigrationPathInput,
): readonly ApmUpdateProtocolBlocker[] {
  const completed = input.completedMigrations ?? [];
  return completed.flatMap((evidence) => {
    const known = input.descriptor.migrations.find((migration) => migration.id === evidence.id);
    return known === undefined || known.checksum === evidence.checksum
      ? []
      : [completedMigrationChecksumMismatch(evidence, known)];
  });
}

/*** Select the unique source-history declaration matching version and optional state revision. */
function matchingHistory(input: ApmMigrationPathInput): readonly ApmSupportedSourceHistory[] {
  return input.descriptor.history.supported.filter(
    (entry) =>
      validRange(entry.sourceRange) !== null &&
      satisfies(input.sourceVersion, entry.sourceRange) &&
      (entry.stateRevision === undefined || entry.stateRevision === input.sourceStateRevision),
  );
}

/*** Convert missing or ambiguous supported history into explicit blockers. */
function historySelectionBlockers(
  input: ApmMigrationPathInput,
  history: readonly ApmSupportedSourceHistory[],
): readonly ApmUpdateProtocolBlocker[] {
  if (history.length === 0) return [unsupportedHistory(input)];
  return [
    createProtocolBlocker({
      code: 'protocol.history-ambiguous',
      kind: 'history',
      evidence: history.map((entry) => entry.sourceRange),
      reason: 'More than one supported history declaration matches the selected source state.',
      nextAction: 'Make source history selectors mutually exclusive.',
    }),
  ];
}

/*** Resolve every acyclic forward migration graph path that reaches the exact selected target. */
function migrationPaths(input: ApmMigrationPathInput): readonly (readonly ApmMigrationDescriptor[])[] {
  return traversePaths(
    {
      version: input.sourceVersion,
      ...(input.sourceStateRevision === undefined
        ? {}
        : { stateRevision: input.sourceStateRevision }),
      completedMigrations: input.completedMigrations ?? [],
      migrations: [],
    },
    input.targetVersion,
    input.descriptor,
  );
}

/*** Recursively traverse migration edges without mutating shared graph state. */
function traversePaths(
  state: MigrationState,
  targetVersion: string,
  descriptor: ApmMigrationPathInput['descriptor'],
): readonly (readonly ApmMigrationDescriptor[])[] {
  if (state.version === targetVersion) return [state.migrations];
  if (state.migrations.length >= descriptor.migrations.length) return [];
  return descriptor.migrations.flatMap((migration) =>
    migrationApplicable(migration, state, descriptor.owner.name, targetVersion)
      ? traversePaths(nextState(state, migration), targetVersion, descriptor)
      : [],
  );
}

/*** Test source state, forward target bounds and same-owner prerequisite readiness. */
function migrationApplicable(
  migration: ApmMigrationDescriptor,
  state: MigrationState,
  owner: string,
  targetVersion: string,
): boolean {
  if (state.migrations.some((item) => item.id === migration.id)) return false;
  if (validRange(migration.from.packageRange) === null) return false;
  if (!satisfies(state.version, migration.from.packageRange)) return false;
  if (!isForwardTarget(migration.to.packageVersion, state.version, targetVersion)) return false;
  if (
    migration.from.stateRevision !== undefined &&
    migration.from.stateRevision !== state.stateRevision
  ) {
    return false;
  }
  const completed = new Set(state.completedMigrations.map((item) => item.id));
  return migration.prerequisites
    .filter((prerequisite) => prerequisite.owner === owner)
    .every((prerequisite) => completed.has(prerequisite.migrationId));
}

/*** Require each selected migration edge to advance without overshooting the reviewed target. */
function isForwardTarget(candidate: string, current: string, target: string): boolean {
  return (
    valid(candidate) !== null &&
    compare(candidate, current) > 0 &&
    compare(candidate, target) <= 0
  );
}

/*** Apply one graph edge to immutable path-search state and completed-history evidence. */
function nextState(state: MigrationState, migration: ApmMigrationDescriptor): MigrationState {
  return {
    version: migration.to.packageVersion,
    ...(migration.to.stateRevision === undefined
      ? {}
      : { stateRevision: migration.to.stateRevision }),
    completedMigrations: [
      ...state.completedMigrations,
      { id: migration.id, checksum: migration.checksum },
    ],
    migrations: [...state.migrations, migration],
  };
}

/*** Build an unsupported-history blocker using explicit owner metadata when available. */
function unsupportedHistory(input: ApmMigrationPathInput): ApmUpdateProtocolBlocker {
  const explicit = input.descriptor.history.unsupported.find(
    (entry) =>
      validRange(entry.sourceRange) !== null && satisfies(input.sourceVersion, entry.sourceRange),
  );
  return createProtocolBlocker({
    code: 'protocol.history-unsupported',
    kind: 'history',
    evidence: [input.sourceVersion, input.targetVersion],
    reason: explicit?.reason ?? 'The owner descriptor does not support this source version/state.',
    ...(explicit?.nextAction === undefined ? {} : { nextAction: explicit.nextAction }),
  });
}

/*** Build checksum mismatch evidence for completed project migration history. */
function completedMigrationChecksumMismatch(
  evidence: ApmCompletedMigrationEvidence,
  migration: ApmMigrationDescriptor,
): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.migration-history-checksum-mismatch',
    kind: 'history',
    id: evidence.id,
    evidence: [evidence.checksum, migration.checksum],
    reason: 'Recorded project migration history does not match the immutable owner checksum.',
    nextAction: 'Inspect or repair the recorded project migration history before updating.',
  });
}

/*** Block paths whose target does not match the immutable descriptor artifact. */
function targetOwnerMismatch(input: ApmMigrationPathInput): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.owner-mismatch',
    kind: 'descriptor',
    evidence: [input.targetVersion, input.descriptor.owner.version],
    reason: 'Migration target version must match the immutable owner descriptor version.',
  });
}

/*** Keep downgrade handling explicit rather than reusing forward migration paths silently. */
function downgradeBlocker(input: ApmMigrationPathInput): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.downgrade-unsupported',
    kind: 'history',
    evidence: [input.sourceVersion, input.targetVersion, input.descriptor.history.downgrade],
    reason:
      input.descriptor.history.downgrade === 'manual'
        ? 'This owner requires manual review for downgrades.'
        : 'This owner does not support automatic downgrades.',
  });
}

/*** Distinguish missing paths from ambiguous alternative migration paths. */
function migrationPathBlocker(
  input: ApmMigrationPathInput,
  pathCount: number,
): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: pathCount === 0 ? 'protocol.migration-path-missing' : 'protocol.migration-path-ambiguous',
    kind: 'migration',
    evidence: [input.sourceVersion, input.targetVersion, `paths:${pathCount}`],
    reason:
      pathCount === 0
        ? 'No complete migration path reaches the selected target version.'
        : 'Multiple complete migration paths reach the selected target version.',
  });
}

/*** Build the successful no-migration history result. */
function noMigrationPath(): ApmMigrationPathResult {
  return { supported: true, noMigrationRequired: true, migrations: [], blockers: [] };
}

/*** Build one successful deterministic migration path result. */
function supportedPath(migrations: readonly ApmMigrationDescriptor[]): ApmMigrationPathResult {
  return { supported: true, noMigrationRequired: false, migrations, blockers: [] };
}

/*** Build one unsupported path result without hiding blocker evidence. */
function unsupportedPath(blockers: readonly ApmUpdateProtocolBlocker[]): ApmMigrationPathResult {
  return { supported: false, noMigrationRequired: false, migrations: [], blockers };
}

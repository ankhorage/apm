import { resolveMigrationPath } from '@ankhorage/apm';
import type { ApmMigrationDescriptor, ApmUpdateDescriptor } from '@ankhorage/apm/types';
import { expect, test } from 'bun:test';

const migrationV2: ApmMigrationDescriptor = {
  id: 'manifest-v2',
  checksum: 'sha256-manifest-v2',
  from: { packageRange: '^1.0.0', stateRevision: 'manifest-v1' },
  to: { packageVersion: '2.0.0', stateRevision: 'manifest-v2' },
  phase: 'pre-install',
  implementation: { artifact: 'target' },
  prerequisites: [],
  affectedScopes: [{ kind: 'file', path: 'app.json' }],
  sideEffects: ['project-files'],
  verification: [{ kind: 'extension', key: 'manifest', description: 'Verify manifest v2.' }],
  recovery: { idempotent: true, restartable: true, reversible: false },
};

const migrationV3: ApmMigrationDescriptor = {
  id: 'manifest-v3',
  checksum: 'sha256-manifest-v3',
  from: { packageRange: '^2.0.0', stateRevision: 'manifest-v2' },
  to: { packageVersion: '3.0.0', stateRevision: 'manifest-v3' },
  phase: 'post-install',
  implementation: { artifact: 'target' },
  prerequisites: [{ owner: '@fixture/owner', migrationId: 'manifest-v2' }],
  affectedScopes: [{ kind: 'file', path: 'app.json' }],
  sideEffects: ['project-files'],
  verification: [{ kind: 'extension', key: 'manifest', description: 'Verify manifest v3.' }],
  recovery: { idempotent: true, restartable: true, reversible: false },
};

const descriptor: ApmUpdateDescriptor = {
  protocolVersion: 1,
  schemaVersion: 1,
  owner: { name: '@fixture/owner', version: '3.0.0' },
  history: {
    supported: [
      { sourceRange: '^1.0.0', stateRevision: 'manifest-v1', mode: 'automatic' },
      { sourceRange: '^2.0.0', stateRevision: 'manifest-v2', mode: 'automatic' },
      { sourceRange: '^3.0.0', stateRevision: 'manifest-v3', mode: 'no-migration' },
    ],
    unsupported: [{ sourceRange: '<1.0.0', reason: 'Pre-v1 history is unsupported.' }],
    downgrade: 'unsupported',
  },
  compatibility: [],
  migrations: [migrationV2, migrationV3],
  projections: [],
  effects: [],
  extension: { export: './apm' },
};

test('treats an explicitly current source state as a legitimate no-op release', () => {
  const result = resolveMigrationPath({
    descriptor,
    sourceVersion: '3.0.0',
    sourceStateRevision: 'manifest-v3',
    completedMigrations: [
      { id: migrationV2.id, checksum: migrationV2.checksum },
      { id: migrationV3.id, checksum: migrationV3.checksum },
    ],
    targetVersion: '3.0.0',
  });

  expect(result.supported).toBe(true);
  expect(result.noMigrationRequired).toBe(true);
  expect(result.migrations).toEqual([]);
});

test('resolves all required migrations when releases were skipped', () => {
  const result = resolveMigrationPath({
    descriptor,
    sourceVersion: '1.5.0',
    sourceStateRevision: 'manifest-v1',
    targetVersion: '3.0.0',
  });

  expect(result.supported).toBe(true);
  expect(result.migrations.map((migration) => migration.id)).toEqual([
    'manifest-v2',
    'manifest-v3',
  ]);
});

test('uses explicit historical migration evidence instead of replaying old migrations', () => {
  const result = resolveMigrationPath({
    descriptor,
    sourceVersion: '2.4.0',
    sourceStateRevision: 'manifest-v2',
    completedMigrations: [{ id: migrationV2.id, checksum: migrationV2.checksum }],
    targetVersion: '3.0.0',
  });

  expect(result.supported).toBe(true);
  expect(result.migrations.map((migration) => migration.id)).toEqual(['manifest-v3']);
});

test('blocks a dependent migration when historical prerequisite evidence is absent', () => {
  const result = resolveMigrationPath({
    descriptor,
    sourceVersion: '2.4.0',
    sourceStateRevision: 'manifest-v2',
    targetVersion: '3.0.0',
  });

  expect(result.supported).toBe(false);
  expect(result.blockers.map((blocker) => blocker.code)).toContain(
    'protocol.migration-path-missing',
  );
});

test('blocks completed history whose checksum no longer matches the immutable migration', () => {
  const result = resolveMigrationPath({
    descriptor,
    sourceVersion: '2.4.0',
    sourceStateRevision: 'manifest-v2',
    completedMigrations: [{ id: migrationV2.id, checksum: 'sha256-wrong' }],
    targetVersion: '3.0.0',
  });

  expect(result.supported).toBe(false);
  expect(result.blockers.map((blocker) => blocker.code)).toContain(
    'protocol.migration-history-checksum-mismatch',
  );
});

test('keeps unsupported historical source state explicit', () => {
  const result = resolveMigrationPath({
    descriptor,
    sourceVersion: '0.9.0',
    targetVersion: '3.0.0',
  });

  expect(result.supported).toBe(false);
  expect(result.blockers.map((blocker) => blocker.code)).toContain('protocol.history-unsupported');
});

test('blocks ambiguous alternative paths to the same target', () => {
  const direct: ApmMigrationDescriptor = {
    ...migrationV2,
    id: 'manifest-v1-direct-v3',
    checksum: 'sha256-manifest-direct-v3',
    to: { packageVersion: '3.0.0', stateRevision: 'manifest-v3' },
  };
  const result = resolveMigrationPath({
    descriptor: { ...descriptor, migrations: [...descriptor.migrations, direct] },
    sourceVersion: '1.5.0',
    sourceStateRevision: 'manifest-v1',
    targetVersion: '3.0.0',
  });

  expect(result.supported).toBe(false);
  expect(result.blockers.map((blocker) => blocker.code)).toContain(
    'protocol.migration-path-ambiguous',
  );
});

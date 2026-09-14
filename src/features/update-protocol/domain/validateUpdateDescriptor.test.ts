import { validateUpdateDescriptor } from '@ankhorage/apm';
import type {
  ApmMigrationDescriptor,
  ApmProjectionDescriptor,
  ApmUpdateDescriptor,
} from '@ankhorage/apm/types';
import { expect, test } from 'bun:test';

const baseDescriptor: ApmUpdateDescriptor = {
  protocolVersion: 1,
  schemaVersion: 1,
  owner: { name: '@fixture/owner', version: '3.0.0' },
  history: {
    supported: [{ sourceRange: '^3.0.0', mode: 'no-migration' }],
    unsupported: [{ sourceRange: '<3.0.0', reason: 'Historical state is not supported.' }],
    downgrade: 'unsupported',
  },
  compatibility: [],
  migrations: [],
  projections: [],
  effects: [],
  extension: { export: './apm' },
};

const migration: ApmMigrationDescriptor = {
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

const projection: ApmProjectionDescriptor = {
  id: 'root-layout',
  claims: [{ kind: 'file', path: 'app/_layout.tsx' }],
  requiresExtension: true,
};

test('round-trips a valid descriptor through the public package API', () => {
  const json = JSON.stringify(baseDescriptor);
  const parsed: unknown = JSON.parse(json);
  const result = validateUpdateDescriptor({
    descriptor: parsed,
    expectedOwner: { name: '@fixture/owner', version: '3.0.0' },
  });

  expect(result.valid).toBe(true);
  expect(result.descriptor).toEqual(baseDescriptor);
  expect(result.blockers).toEqual([]);
});

test('rejects unsupported protocol metadata before exposing a typed descriptor', () => {
  const result = validateUpdateDescriptor({
    descriptor: { ...baseDescriptor, protocolVersion: 2 },
  });

  expect(result.valid).toBe(false);
  expect(result.descriptor).toBeUndefined();
  expect(result.blockers.map((blocker) => blocker.code)).toContain('protocol.unsupported-version');
});

test('blocks duplicate migration IDs and changed published checksums', () => {
  const descriptor: ApmUpdateDescriptor = {
    ...baseDescriptor,
    migrations: [migration, { ...migration, checksum: 'sha256-new' }],
  };
  const previous: ApmUpdateDescriptor = {
    ...baseDescriptor,
    owner: { ...baseDescriptor.owner, version: '2.0.0' },
    migrations: [{ ...migration, checksum: 'sha256-old' }],
  };
  const result = validateUpdateDescriptor({ descriptor, previousDescriptors: [previous] });
  const codes = result.blockers.map((blocker) => blocker.code);

  expect(codes).toContain('protocol.duplicate-migration-id');
  expect(codes).toContain('protocol.migration-checksum-changed');
});

test('blocks prerequisite cycles across selected migration metadata', () => {
  const first: ApmMigrationDescriptor = {
    ...migration,
    id: 'first',
    prerequisites: [{ owner: '@fixture/owner', migrationId: 'second' }],
  };
  const second: ApmMigrationDescriptor = {
    ...migration,
    id: 'second',
    prerequisites: [{ owner: '@fixture/owner', migrationId: 'first' }],
  };
  const result = validateUpdateDescriptor({
    descriptor: { ...baseDescriptor, migrations: [first, second] },
  });

  expect(result.blockers.map((blocker) => blocker.code)).toContain(
    'protocol.migration-prerequisite-cycle',
  );
});

test('blocks overlapping projection ownership claims', () => {
  const result = validateUpdateDescriptor({
    descriptor: {
      ...baseDescriptor,
      projections: [projection, { ...projection, id: 'other-root-layout' }],
    },
  });

  expect(result.blockers.map((blocker) => blocker.code)).toContain(
    'protocol.projection-ownership-conflict',
  );
});

test('requires platform evidence before claiming OTA eligibility', () => {
  const result = validateUpdateDescriptor({
    descriptor: {
      ...baseDescriptor,
      effects: [
        {
          kind: 'ota-eligibility',
          eligibility: 'eligible',
          evidence: [],
          reason: 'Owner claims this can ship OTA.',
        },
      ],
    },
  });

  expect(result.blockers.map((blocker) => blocker.code)).toContain(
    'protocol.ota-evidence-required',
  );
});

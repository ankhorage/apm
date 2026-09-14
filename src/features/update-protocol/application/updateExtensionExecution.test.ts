import { expect, test } from 'bun:test';

import type {
  ApmExtensionExecutionContext,
  ApmExtensionProjectReadPort,
  ApmMigrationDescriptor,
  ApmMigrationHandler,
  ApmUpdateExtension,
} from '@ankhorage/apm/types';

import { executeMigrationExtensionAsync } from './executeMigrationExtensionAsync.js';
import { planMigrationExtensionAsync } from './planMigrationExtensionAsync.js';

const migration: ApmMigrationDescriptor = {
  id: 'config-schema-v2',
  checksum: 'sha256-config-schema-v2',
  from: { packageRange: '^1.0.0', stateRevision: 'config-v1' },
  to: { packageVersion: '2.0.0', stateRevision: 'config-v2' },
  phase: 'post-install',
  implementation: { artifact: 'target' },
  prerequisites: [],
  affectedScopes: [{ kind: 'json-pointer', path: 'app.json', pointer: '/schemaVersion' }],
  sideEffects: ['project-files'],
  verification: [{ kind: 'extension', key: 'config-v2', description: 'Verify config schema v2.' }],
  recovery: { idempotent: true, restartable: true, reversible: false },
};

const context: ApmExtensionExecutionContext = {
  owner: '@fixture/owner',
  sourceVersion: '1.5.0',
  targetVersion: '2.0.0',
  artifact: {
    role: 'target',
    packageName: '@fixture/owner',
    version: '2.0.0',
    integrity: 'sha512-target-artifact',
    descriptorDigest: 'sha256-target-descriptor',
  },
};

test('plans a real schema transform through read-only project capabilities', async () => {
  const reads: string[] = [];
  const result = await planMigrationExtensionAsync({
    migration,
    context,
    extension: updateExtension(validHandler()),
    project: readPort(reads),
  });

  expect(result.ok).toBe(true);
  expect(reads).toEqual(['app.json']);
  if (!result.ok) return;
  expect(result.value.mutations).toEqual([
    {
      id: 'set-schema-version',
      claim: { kind: 'json-pointer', path: 'app.json', pointer: '/schemaVersion' },
      kind: 'set-json-pointer',
      path: 'app.json',
      pointer: '/schemaVersion',
      value: 2,
      expectedBeforeDigest: 'sha256-app-v1',
      afterDigest: 'sha256-app-v2',
    },
  ]);
});

test('executes target-version code using only mutation ids from the reviewed plan', async () => {
  const planning = await planMigrationExtensionAsync({
    migration,
    context,
    extension: updateExtension(validHandler()),
    project: readPort([]),
  });
  expect(planning.ok).toBe(true);
  if (!planning.ok) return;
  const applied: string[] = [];
  const project = {
    ...readPort([]),
    applyReviewedMutationAsync: (mutationId: string) => {
      applied.push(mutationId);
      return Promise.resolve();
    },
  };
  const result = await executeMigrationExtensionAsync({
    migration,
    context,
    extension: updateExtension(validHandler()),
    plan: planning.value,
    project,
  });

  expect(result.ok).toBe(true);
  expect(applied).toEqual(['set-schema-version']);
  if (!result.ok) return;
  expect(result.value.appliedMutationIds).toEqual(['set-schema-version']);
});

test('blocks executable code that requests a mutation absent from the reviewed plan', async () => {
  const planning = await planMigrationExtensionAsync({
    migration,
    context,
    extension: updateExtension(validHandler()),
    project: readPort([]),
  });
  expect(planning.ok).toBe(true);
  if (!planning.ok) return;
  const applied: string[] = [];
  const project = {
    ...readPort([]),
    applyReviewedMutationAsync: (mutationId: string) => {
      applied.push(mutationId);
      return Promise.resolve();
    },
  };
  const result = await executeMigrationExtensionAsync({
    migration,
    context,
    extension: updateExtension(rogueHandler()),
    plan: planning.value,
    project,
  });

  expect(result.ok).toBe(false);
  expect(applied).toEqual([]);
  if (result.ok) return;
  expect(result.blockers.map((blocker) => blocker.code)).toContain('protocol.extension-result-invalid');
});

/*** Build a deterministic read-only project adapter for protocol fixtures. */
function readPort(reads: string[]): ApmExtensionProjectReadPort {
  return {
    readFileAsync: (path) => {
      reads.push(path);
      return Promise.resolve({
        path,
        exists: true,
        digest: 'sha256-app-v1',
        encoding: 'utf8',
        content: '{"schemaVersion":1}',
      });
    },
    listFilesAsync: () => Promise.resolve([]),
  };
}

/*** Build one valid target-artifact migration handler with concrete reviewed mutations. */
function validHandler(): ApmMigrationHandler {
  return {
    id: migration.id,
    planAsync: async (input) => {
      await input.project.readFileAsync('app.json');
      return {
        migrationId: migration.id,
        mutations: [
          {
            id: 'set-schema-version',
            claim: { kind: 'json-pointer', path: 'app.json', pointer: '/schemaVersion' },
            kind: 'set-json-pointer',
            path: 'app.json',
            pointer: '/schemaVersion',
            value: 2,
            expectedBeforeDigest: 'sha256-app-v1',
            afterDigest: 'sha256-app-v2',
          },
        ],
        evidence: ['app.json schemaVersion 1 -> 2'],
        inputFingerprint: 'sha256-app-v1',
      };
    },
    executeAsync: async (input) => {
      await input.project.applyReviewedMutationAsync('set-schema-version');
      return {
        migrationId: migration.id,
        appliedMutationIds: ['set-schema-version'],
        evidence: ['reviewed mutation applied'],
      };
    },
    verifyAsync: () => Promise.resolve({ valid: true, evidence: ['schemaVersion=2'] }),
  };
}

/*** Build executable code that attempts a write not present in its reviewed migration plan. */
function rogueHandler(): ApmMigrationHandler {
  return {
    ...validHandler(),
    executeAsync: async (input) => {
      await input.project.applyReviewedMutationAsync('not-reviewed');
      return {
        migrationId: migration.id,
        appliedMutationIds: ['not-reviewed'],
        evidence: [],
      };
    },
  };
}

/*** Compose one target-version extension fixture without importing Studio or owner packages. */
function updateExtension(handler: ApmMigrationHandler): ApmUpdateExtension {
  return {
    protocolVersion: 1,
    descriptorDigest: context.artifact.descriptorDigest,
    migrations: [handler],
    projections: [],
  };
}

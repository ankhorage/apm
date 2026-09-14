import { expect, test } from 'bun:test';

import {
  validateUpdateExtensionBinding,
  validateUpdateExtensionCapabilities,
} from '@ankhorage/apm';
import type {
  ApmExtensionArtifactIdentity,
  ApmMigrationDescriptor,
  ApmMigrationHandler,
  ApmProjectionHandler,
  ApmUpdateDescriptor,
  ApmUpdateExtension,
} from '@ankhorage/apm/types';

const sourceMigration = migration('source-migration', 'source');
const targetMigration = migration('target-migration', 'target');
const intermediateMigration: ApmMigrationDescriptor = {
  ...migration('intermediate-migration', 'intermediate'),
  implementation: { artifact: 'intermediate', version: '2.5.0' },
};

const descriptor: ApmUpdateDescriptor = {
  protocolVersion: 1,
  schemaVersion: 1,
  owner: { name: '@fixture/owner', version: '3.0.0' },
  history: {
    supported: [{ sourceRange: '^2.0.0', mode: 'automatic' }],
    unsupported: [],
    downgrade: 'unsupported',
  },
  compatibility: [],
  migrations: [sourceMigration, targetMigration, intermediateMigration],
  projections: [
    {
      id: 'generated-config',
      claims: [{ kind: 'file', path: 'generated.json' }],
      requiresExtension: true,
    },
  ],
  effects: [],
  extension: { export: './apm' },
};

const targetArtifact = artifact('target', '3.0.0', 'target-digest');
const sourceArtifact = artifact('source', '2.0.0', 'source-digest');
const intermediateArtifact = artifact('intermediate', '2.5.0', 'intermediate-digest');

test('binds loaded target code to the exact frozen descriptor digest', () => {
  const extension = updateExtension('target-digest', ['target-migration'], ['generated-config']);

  expect(validateUpdateExtensionBinding(targetArtifact, extension)).toEqual([]);
  expect(validateUpdateExtensionCapabilities(descriptor, targetArtifact, extension)).toEqual([]);
});

test('does not require source or intermediate migration handlers from the target artifact', () => {
  const extension = updateExtension('target-digest', ['target-migration'], ['generated-config']);
  const blockers = validateUpdateExtensionCapabilities(descriptor, targetArtifact, extension);

  expect(blockers).toEqual([]);
});

test('selects source and intermediate handlers only from their declared artifact roles', () => {
  const sourceExtension = updateExtension('source-digest', ['source-migration'], []);
  const intermediateExtension = updateExtension(
    'intermediate-digest',
    ['intermediate-migration'],
    [],
  );

  expect(validateUpdateExtensionCapabilities(descriptor, sourceArtifact, sourceExtension)).toEqual([]);
  expect(
    validateUpdateExtensionCapabilities(descriptor, intermediateArtifact, intermediateExtension),
  ).toEqual([]);
});

test('blocks a selected artifact that lacks one of its required handlers', () => {
  const extension = updateExtension('target-digest', [], ['generated-config']);
  const blockers = validateUpdateExtensionCapabilities(descriptor, targetArtifact, extension);

  expect(blockers.map((blocker) => blocker.code)).toContain('protocol.extension-binding-mismatch');
  expect(blockers.map((blocker) => blocker.scope.id)).toContain('target-migration');
});

test('blocks loaded code whose runtime protocol or descriptor digest differs', () => {
  const wrongDigest = updateExtension('different-digest', ['target-migration'], ['generated-config']);
  const wrongProtocol: unknown = { ...wrongDigest, protocolVersion: 2 };

  expect(validateUpdateExtensionBinding(targetArtifact, wrongDigest)[0]?.code).toBe(
    'protocol.extension-binding-mismatch',
  );
  expect(validateUpdateExtensionBinding(targetArtifact, wrongProtocol)[0]?.code).toBe(
    'protocol.extension-binding-mismatch',
  );
});

/*** Build one minimal migration descriptor with an exact executable artifact role. */
function migration(
  id: string,
  role: ApmMigrationDescriptor['implementation']['artifact'],
): ApmMigrationDescriptor {
  return {
    id,
    checksum: `sha256-${id}`,
    from: { packageRange: '^2.0.0' },
    to: { packageVersion: '3.0.0' },
    phase: 'post-install',
    implementation: { artifact: role },
    prerequisites: [],
    affectedScopes: [{ kind: 'file', path: `${id}.json` }],
    sideEffects: ['project-files'],
    verification: [],
    recovery: { idempotent: true, restartable: true, reversible: false },
  };
}

/*** Build one immutable staged artifact identity for binding tests. */
function artifact(
  role: ApmExtensionArtifactIdentity['role'],
  version: string,
  descriptorDigest: string,
): ApmExtensionArtifactIdentity {
  return {
    role,
    packageName: '@fixture/owner',
    version,
    integrity: `sha512-${role}-${version}`,
    descriptorDigest,
  };
}

/*** Build a typed executable extension inventory without invoking its handlers. */
function updateExtension(
  descriptorDigest: string,
  migrationIds: readonly string[],
  projectionIds: readonly string[],
): ApmUpdateExtension {
  return {
    protocolVersion: 1,
    descriptorDigest,
    migrations: migrationIds.map(migrationHandler),
    projections: projectionIds.map(projectionHandler),
  };
}

/*** Build one inert migration handler used only for capability inventory validation. */
function migrationHandler(id: string): ApmMigrationHandler {
  return {
    id,
    planAsync: (input) =>
      Promise.resolve({
        migrationId: input.descriptor.id,
        mutations: [],
        evidence: [],
        inputFingerprint: 'fixture-input',
      }),
    executeAsync: (input) =>
      Promise.resolve({
        migrationId: input.descriptor.id,
        appliedMutationIds: [],
        evidence: [],
      }),
    verifyAsync: () => Promise.resolve({ valid: true, evidence: [] }),
  };
}

/*** Build one inert projection handler used only for capability inventory validation. */
function projectionHandler(id: string): ApmProjectionHandler {
  return {
    id,
    inspectAsync: (input) =>
      Promise.resolve({
        projectionId: input.descriptor.id,
        state: 'current',
        inputFingerprint: 'fixture-input',
        generatorFingerprint: 'fixture-generator',
        evidence: [],
      }),
    planAsync: (input) =>
      Promise.resolve({
        projectionId: input.descriptor.id,
        mutations: [],
        inputFingerprint: 'fixture-input',
        generatorFingerprint: 'fixture-generator',
        evidence: [],
      }),
    materializeAsync: () => Promise.resolve(),
    verifyAsync: () => Promise.resolve({ valid: true, evidence: [] }),
  };
}

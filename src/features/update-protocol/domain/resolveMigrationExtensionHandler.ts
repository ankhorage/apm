import type {
  ApmExtensionExecutionContext,
  ApmMigrationHandler,
} from '../../../types/update-extension.js';
import type { ApmMigrationDescriptor } from '../../../types/update-protocol.js';
import type { ApmUpdateProtocolBlocker } from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';
import { isApmUpdateExtension } from './isApmUpdateExtension.js';
import { validateUpdateExtensionBinding } from './validateUpdateExtensionBinding.js';

interface MigrationHandlerResolution {
  readonly handler?: ApmMigrationHandler;
  readonly blockers: readonly ApmUpdateProtocolBlocker[];
}

/*** Resolve one migration handler only after artifact binding and source/target context match. */
export function resolveMigrationExtensionHandler(
  migration: ApmMigrationDescriptor,
  context: ApmExtensionExecutionContext,
  extension: unknown,
): MigrationHandlerResolution {
  const bindingBlockers = validateUpdateExtensionBinding(context.artifact, extension);
  if (bindingBlockers.length > 0) return { blockers: bindingBlockers };
  if (!isApmUpdateExtension(extension)) return { blockers: [invalidLoadedExtension()] };
  const contextBlockers = migrationArtifactContextBlockers(migration, context);
  if (contextBlockers.length > 0) return { blockers: contextBlockers };
  const handler = extension.migrations.find((candidate) => candidate.id === migration.id);
  return handler === undefined
    ? { blockers: [missingMigrationHandler(migration.id)] }
    : { handler, blockers: [] };
}

/*** Verify owner, implementation role and exact staged artifact version before invocation. */
function migrationArtifactContextBlockers(
  migration: ApmMigrationDescriptor,
  context: ApmExtensionExecutionContext,
): readonly ApmUpdateProtocolBlocker[] {
  const { artifact } = context;
  return [
    ...(artifact.packageName === context.owner
      ? []
      : [contextMismatch(migration.id, 'owner', artifact.packageName, context.owner)]),
    ...(artifact.role === migration.implementation.artifact
      ? []
      : [contextMismatch(migration.id, 'artifact role', artifact.role, migration.implementation.artifact)]),
    ...artifactVersionBlockers(migration, context),
  ];
}

/*** Bind source/target/intermediate code to the exact version frozen by the reviewed context. */
function artifactVersionBlockers(
  migration: ApmMigrationDescriptor,
  context: ApmExtensionExecutionContext,
): readonly ApmUpdateProtocolBlocker[] {
  const expected = expectedArtifactVersion(migration, context);
  return expected !== undefined && context.artifact.version === expected
    ? []
    : [
        contextMismatch(
          migration.id,
          'artifact version',
          context.artifact.version,
          expected ?? 'declared intermediate version',
        ),
      ];
}

/*** Resolve the version expected for a migration implementation artifact role. */
function expectedArtifactVersion(
  migration: ApmMigrationDescriptor,
  context: ApmExtensionExecutionContext,
): string | undefined {
  if (context.artifact.role === 'source') return context.sourceVersion;
  if (context.artifact.role === 'target') return context.targetVersion;
  return migration.implementation.version;
}

/*** Build exact-context mismatch evidence for trusted executable owner code. */
function contextMismatch(
  migrationId: string,
  subject: string,
  actual: string,
  expected: string,
): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.extension-binding-mismatch',
    kind: 'extension',
    id: migrationId,
    evidence: [actual, expected],
    reason: `Migration extension ${subject} does not match the reviewed execution context.`,
  });
}

/*** Build missing executable migration handler evidence. */
function missingMigrationHandler(id: string): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.extension-binding-mismatch',
    kind: 'extension',
    id,
    evidence: [id],
    reason: `Selected artifact extension does not export migration handler ${id}.`,
  });
}

/*** Preserve structured failure if the loaded extension changed between validation and narrowing. */
function invalidLoadedExtension(): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.extension-binding-mismatch',
    kind: 'extension',
    evidence: [],
    reason: 'Loaded owner code no longer matches the validated APM extension shape.',
  });
}

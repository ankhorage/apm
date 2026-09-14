import type {
  ApmExtensionArtifactIdentity,
  ApmUpdateExtension,
} from '../../../types/update-extension.js';
import type {
  ApmMigrationDescriptor,
  ApmUpdateDescriptor,
} from '../../../types/update-protocol.js';
import type { ApmUpdateProtocolBlocker } from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';

/*** Validate only the handlers required from the selected source/target/intermediate artifact. */
export function validateUpdateExtensionCapabilities(
  descriptor: ApmUpdateDescriptor,
  artifact: ApmExtensionArtifactIdentity,
  extension: ApmUpdateExtension,
): readonly ApmUpdateProtocolBlocker[] {
  return [
    ...requiredMigrationIds(descriptor, artifact).flatMap((id) =>
      extension.migrations.some((handler) => handler.id === id)
        ? []
        : [missingHandler('migration', id)],
    ),
    ...requiredProjectionIds(descriptor, artifact).flatMap((id) =>
      extension.projections.some((handler) => handler.id === id)
        ? []
        : [missingHandler('projection', id)],
    ),
  ];
}

/*** Select migration handlers whose declared implementation role resolves to this artifact. */
function requiredMigrationIds(
  descriptor: ApmUpdateDescriptor,
  artifact: ApmExtensionArtifactIdentity,
): readonly string[] {
  return descriptor.migrations
    .filter((migration) => migrationUsesArtifact(migration, artifact))
    .map((migration) => migration.id);
}

/*** Target artifacts own executable projection handlers for their immutable descriptor. */
function requiredProjectionIds(
  descriptor: ApmUpdateDescriptor,
  artifact: ApmExtensionArtifactIdentity,
): readonly string[] {
  if (artifact.role !== 'target' || artifact.version !== descriptor.owner.version) return [];
  return descriptor.projections
    .filter((projection) => projection.requiresExtension)
    .map((projection) => projection.id);
}

/*** Resolve one migration implementation role against an exact staged artifact identity. */
function migrationUsesArtifact(
  migration: ApmMigrationDescriptor,
  artifact: ApmExtensionArtifactIdentity,
): boolean {
  const { implementation } = migration;
  if (implementation.artifact !== artifact.role) return false;
  if (artifact.role !== 'intermediate') return true;
  return implementation.version === artifact.version;
}

/*** Build evidence for one reviewed capability whose selected artifact lacks executable code. */
function missingHandler(kind: 'migration' | 'projection', id: string): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.extension-binding-mismatch',
    kind: 'extension',
    id,
    evidence: [kind, id],
    reason: `Selected artifact extension does not provide required ${kind} handler ${id}.`,
  });
}

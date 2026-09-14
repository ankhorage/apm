import type {
  ApmMigrationDescriptor,
  ApmUpdateDescriptor,
} from '../../../types/update-protocol.js';
import type { ApmUpdateProtocolBlocker } from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';
import { migrationIdentity } from '../utils/migrationIdentity.js';

/*** Validate cross-package migration prerequisite references and detect dependency cycles. */
export function validateMigrationPrerequisites(
  descriptor: ApmUpdateDescriptor,
  relatedDescriptors: readonly ApmUpdateDescriptor[] = [],
): readonly ApmUpdateProtocolBlocker[] {
  const nodes = migrationNodes([descriptor, ...relatedDescriptors]);
  return [...missingPrerequisiteBlockers(descriptor, nodes), ...cycleBlockers(nodes)];
}

interface MigrationNode {
  readonly owner: string;
  readonly migration: ApmMigrationDescriptor;
}

/*** Build one stable node map for all selected owner descriptors. */
function migrationNodes(
  descriptors: readonly ApmUpdateDescriptor[],
): ReadonlyMap<string, MigrationNode> {
  return new Map(
    descriptors.flatMap((item) =>
      item.migrations.map(
        (migration) =>
          [
            migrationIdentity(item.owner.name, migration.id),
            { owner: item.owner.name, migration },
          ] as const,
      ),
    ),
  );
}

/*** Report prerequisite identities that are absent from the selected descriptor set. */
function missingPrerequisiteBlockers(
  descriptor: ApmUpdateDescriptor,
  nodes: ReadonlyMap<string, MigrationNode>,
): readonly ApmUpdateProtocolBlocker[] {
  return descriptor.migrations.flatMap((migration) =>
    migration.prerequisites.flatMap((prerequisite) => {
      const identity = migrationIdentity(prerequisite.owner, prerequisite.migrationId);
      return nodes.has(identity)
        ? []
        : [
            createProtocolBlocker({
              code: 'protocol.migration-prerequisite-missing',
              kind: 'migration',
              id: migration.id,
              evidence: [identity],
              reason: `Migration prerequisite ${identity} is not present in the selected owner descriptors.`,
            }),
          ];
    }),
  );
}

/*** Report one graph blocker when selected prerequisite relationships contain a cycle. */
function cycleBlockers(
  nodes: ReadonlyMap<string, MigrationNode>,
): readonly ApmUpdateProtocolBlocker[] {
  const cyclic = [...nodes.keys()].filter((identity) => hasCycleFrom(identity, nodes, new Set()));
  return cyclic.length === 0
    ? []
    : [
        createProtocolBlocker({
          code: 'protocol.migration-prerequisite-cycle',
          kind: 'migration',
          evidence: cyclic,
          reason:
            'Migration prerequisites contain a cycle and cannot be ordered deterministically.',
          nextAction: 'Break the prerequisite cycle before publishing the owner descriptors.',
        }),
      ];
}

/*** Traverse immutable prerequisite ancestry and detect a repeated active identity. */
function hasCycleFrom(
  identity: string,
  nodes: ReadonlyMap<string, MigrationNode>,
  active: ReadonlySet<string>,
): boolean {
  if (active.has(identity)) return true;
  const node = nodes.get(identity);
  if (node === undefined) return false;
  const nextActive = new Set([...active, identity]);
  return node.migration.prerequisites.some((prerequisite) =>
    hasCycleFrom(
      migrationIdentity(prerequisite.owner, prerequisite.migrationId),
      nodes,
      nextActive,
    ),
  );
}

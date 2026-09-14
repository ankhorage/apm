import type { ApmInstallRootInventory } from '../../../types/status.js';

/*** Derive bounded dependency paths from direct declarations without collapsing duplicate versions. */
export function buildDependencyPaths(
  root: ApmInstallRootInventory,
): ReadonlyMap<string, readonly (readonly string[])[]> {
  const packagesById = new Map(root.lockedPackages.map((pkg) => [pkg.id, pkg]));
  const directIds = root.declarations.flatMap((declaration) =>
    declaration.resolvedPackageId === undefined ? [] : [declaration.resolvedPackageId],
  );
  const paths = new Map<string, string[][]>();
  const queue = directIds.map((id) => ({ id, path: [globalPackageId(root.id, id)] }));
  for (const item of queue) appendPaths(item, root.id, packagesById, paths, queue);
  return paths;
}

interface PathQueueItem {
  readonly id: string;
  readonly path: readonly string[];
}

/*** Append one unique path and enqueue unseen dependency edges within explicit safety bounds. */
function appendPaths(
  item: PathQueueItem,
  rootId: string,
  packagesById: ReadonlyMap<string, ApmInstallRootInventory['lockedPackages'][number]>,
  paths: Map<string, string[][]>,
  queue: PathQueueItem[],
): void {
  const existing = paths.get(item.id) ?? [];
  if (existing.length >= 8 || item.path.length > 64 || containsPath(existing, item.path)) return;
  paths.set(item.id, [...existing, [...item.path]]);
  const pkg = packagesById.get(item.id);
  if (pkg === undefined) return;
  for (const edge of pkg.dependencies) {
    if (edge.packageId === undefined) continue;
    const globalId = globalPackageId(rootId, edge.packageId);
    if (!item.path.includes(globalId)) {
      queue.push({ id: edge.packageId, path: [...item.path, globalId] });
    }
  }
}

/*** Compare serialized path identities without mutating stored evidence. */
function containsPath(existing: readonly (readonly string[])[], candidate: readonly string[]): boolean {
  const key = candidate.join('\u0000');
  return existing.some((path) => path.join('\u0000') === key);
}

/*** Create stable cross-root package identity without modifying manager-native instance IDs. */
function globalPackageId(rootId: string, packageId: string): string {
  return `${rootId}::${packageId}`;
}

import type {
  ApmPlanArtifactIdentity,
  ApmPlanResolvedPackage,
} from '../../../../types/plan.js';
import type { ApmInstallRootInventory } from '../../../../types/status.js';

/*** Convert one native staged lock inventory into globally unique serializable plan graph evidence. */
export function toPlanResolutionGraph(
  root: ApmInstallRootInventory,
  installRootId: string,
): {
  readonly packages: readonly ApmPlanResolvedPackage[];
  readonly artifacts: readonly ApmPlanArtifactIdentity[];
} {
  const directIds = new Set(
    root.declarations.flatMap(({ resolvedPackageId }) =>
      resolvedPackageId === undefined ? [] : [resolvedPackageId],
    ),
  );
  const packages = root.lockedPackages.map((pkg) => ({
    id: globalPackageId(installRootId, pkg.id),
    name: pkg.name,
    ...(pkg.version === undefined ? {} : { version: pkg.version }),
    direct: directIds.has(pkg.id),
    source: pkg.source,
    dependencies: pkg.dependencies.flatMap(({ packageId }) =>
      packageId === undefined ? [] : [globalPackageId(installRootId, packageId)],
    ),
    ...(pkg.peerContext === undefined ? {} : { peerContext: pkg.peerContext }),
  }));
  const artifacts = root.lockedPackages.map((pkg) => ({
    id: globalPackageId(installRootId, pkg.id),
    packageName: pkg.name,
    ...(pkg.version === undefined ? {} : { version: pkg.version }),
    source: pkg.source,
  }));
  return {
    packages: packages.sort((left, right) => compareText(left.id, right.id)),
    artifacts: artifacts.sort((left, right) => compareText(left.id, right.id)),
  };
}

/*** Prefix manager-native instance IDs with the original install-root ID to avoid cross-root collisions. */
function globalPackageId(rootId: string, packageId: string): string {
  return `${rootId}::${packageId}`;
}

/*** Compare graph identities without locale-dependent ordering. */
function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

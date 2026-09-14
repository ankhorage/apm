import type {
  ApmPlanArtifactIdentity,
  ApmPlanBlocker,
  ApmPlanResolvedPackage,
} from '../../../../types/plan.js';
import type {
  ApmInstallRootInventory,
  ApmLockedPackageEvidence,
} from '../../../../types/status.js';

/*** Convert one native staged lock inventory into globally unique serializable plan graph evidence. */
export function toPlanResolutionGraph(
  root: ApmInstallRootInventory,
  installRootId: string,
): {
  readonly packages: readonly ApmPlanResolvedPackage[];
  readonly artifacts: readonly ApmPlanArtifactIdentity[];
  readonly blockers: readonly ApmPlanBlocker[];
} {
  const directIds = new Set(
    root.declarations.flatMap(({ resolvedPackageId }) =>
      resolvedPackageId === undefined ? [] : [resolvedPackageId],
    ),
  );
  const knownPackages = root.lockedPackages.filter(({ source }) => isPlanArtifactSource(source));
  const packages = knownPackages.map((pkg) => ({
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
  const artifacts = knownPackages.map((pkg) => ({
    id: globalPackageId(installRootId, pkg.id),
    packageName: pkg.name,
    ...(pkg.version === undefined ? {} : { version: pkg.version }),
    source: pkg.source,
  }));
  return {
    packages: packages.sort((left, right) => compareText(left.id, right.id)),
    artifacts: artifacts.sort((left, right) => compareText(left.id, right.id)),
    blockers: root.lockedPackages.flatMap((pkg) =>
      pkg.source === 'unknown' ? [unknownArtifactSourceBlocker(installRootId, pkg)] : [],
    ),
  };
}

/*** Narrow status source evidence to sources that can become immutable plan artifact identities. */
function isPlanArtifactSource(
  source: ApmLockedPackageEvidence['source'],
): source is ApmPlanArtifactIdentity['source'] {
  return source !== 'unknown';
}

/*** Reject package instances whose source cannot be frozen into an executable saved plan. */
function unknownArtifactSourceBlocker(
  installRootId: string,
  pkg: ApmLockedPackageEvidence,
): ApmPlanBlocker {
  return {
    code: 'plan.artifact-identity-unknown',
    scope: { kind: 'package', id: globalPackageId(installRootId, pkg.id) },
    evidence: [pkg.name, pkg.id],
    reason: 'Native lock evidence did not identify a reproducible package artifact source.',
    nextAction: 'Use a supported registry, workspace, file, or git package source before saving this plan.',
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

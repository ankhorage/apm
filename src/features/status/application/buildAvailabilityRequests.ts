import type {
  ApmAvailabilityRequest,
  ApmDependencyInventory,
  ApmStatusHostPackage,
  ApmInstallRootInventory,
} from '../../../types/status.js';

/*** Build availability requests for lock instances, unresolved declarations, and host packages. */
export function buildAvailabilityRequests(
  inventory: ApmDependencyInventory,
  hosts: readonly ApmStatusHostPackage[],
): readonly ApmAvailabilityRequest[] {
  return [
    ...inventory.roots.flatMap(buildRootRequests),
    ...hosts.map((host) => ({
      packageId: `host:${host.id}`,
      name: host.name,
      role: 'host' as const,
      currentVersion: host.version,
      ...(host.declaredRange === undefined ? {} : { declaredRange: host.declaredRange }),
    })),
  ];
}

/*** Build package requests for one install root while preserving lock-instance identity. */
function buildRootRequests(root: ApmInstallRootInventory): readonly ApmAvailabilityRequest[] {
  const declarationsByPackage = new Map(
    root.declarations.flatMap((declaration) =>
      declaration.resolvedPackageId === undefined
        ? []
        : [[declaration.resolvedPackageId, declaration] as const],
    ),
  );
  const locked = root.lockedPackages.map((pkg): ApmAvailabilityRequest => {
    const declaration = declarationsByPackage.get(pkg.id);
    return {
      packageId: `${root.id}::${pkg.id}`,
      name: pkg.name,
      role: 'application',
      source: pkg.source,
      ...(pkg.version === undefined ? {} : { currentVersion: pkg.version }),
      ...(declaration === undefined ? {} : { declaredRange: declaration.range }),
    };
  });
  const resolved = new Set(root.lockedPackages.map((pkg) => pkg.id));
  const unresolved = root.declarations
    .filter((declaration) => !isResolvedDeclaration(declaration.resolvedPackageId, resolved))
    .map((declaration): ApmAvailabilityRequest => ({
      packageId: `decl:${root.id}:${declaration.ownerPath}:${declaration.name}`,
      name: declaration.name,
      role: 'application',
      source: sourceFromDeclaration(declaration.range),
      declaredRange: declaration.range,
    }));
  return [...locked, ...unresolved];
}

/*** Test whether a declaration points at a lock instance actually present in this root. */
function isResolvedDeclaration(
  packageId: string | undefined,
  resolved: ReadonlySet<string>,
): boolean {
  return packageId !== undefined && resolved.has(packageId);
}

/*** Classify non-registry declaration protocols before registry availability is queried. */
function sourceFromDeclaration(
  range: string,
): NonNullable<ApmAvailabilityRequest['source']> {
  if (/^(?:workspace|link):/u.test(range)) return 'workspace';
  if (/^(?:file|portal):/u.test(range)) return 'file';
  if (/^(?:git\+|github:|gitlab:|bitbucket:)/u.test(range)) return 'git';
  return 'registry';
}

import type {
  ApmAvailabilityEvidence,
  ApmDependencyDeclaration,
  ApmInstalledPackageEvidence,
  ApmInstallRootInventory,
  ApmPackageAvailabilityEvidence,
  ApmStatusDependency,
  ApmStatusFinding,
} from '../../../types/status.js';
import { buildDependencyPaths } from './buildDependencyPaths.js';
import { evaluateDependencyFindings } from './evaluateDependencyFindings.js';

/*** Evaluate every lock instance and unresolved direct declaration for one install root. */
export function evaluateDependencies(
  root: ApmInstallRootInventory,
  availability: ApmAvailabilityEvidence,
): readonly ApmStatusDependency[] {
  const installedByPackage = new Map(
    root.installedPackages.map((installed) => [installed.packageId, installed]),
  );
  const declarationsByPackage = new Map(
    root.declarations.flatMap((declaration) =>
      declaration.resolvedPackageId === undefined
        ? []
        : [[declaration.resolvedPackageId, declaration] as const],
    ),
  );
  const pathsByPackage = buildDependencyPaths(root);
  const locked = root.lockedPackages.map((pkg): ApmStatusDependency => {
    const packageId = globalPackageId(root.id, pkg.id);
    const declaration = declarationsByPackage.get(pkg.id);
    const installed = installedByPackage.get(pkg.id) ?? unknownInstallation(pkg.id);
    const packageAvailability = findAvailability(packageId, pkg.name, availability);
    return {
      packageId,
      installRootId: root.id,
      name: pkg.name,
      direct: declaration !== undefined,
      ...(declaration === undefined ? {} : { declaration }),
      ...(pkg.version === undefined ? {} : { lockedVersion: pkg.version }),
      installed,
      availability: packageAvailability,
      dependencyPaths: pathsByPackage.get(pkg.id) ?? [],
      findings: evaluateDependencyFindings({
        packageId,
        ...(root.lockfile.path === undefined ? {} : { lockfilePath: root.lockfile.path }),
        pkg,
        ...(declaration === undefined ? {} : { declaration }),
        installed,
        availability: packageAvailability,
      }),
    };
  });
  const resolvedIds = new Set(root.lockedPackages.map((pkg) => pkg.id));
  const unresolved = root.declarations
    .filter((declaration) => !isResolvedDeclaration(declaration, resolvedIds))
    .map((declaration) => unresolvedDeclaration(root, declaration, availability));
  return [...locked, ...unresolved];
}

/*** Test whether a direct declaration resolves to an existing package instance in this root. */
function isResolvedDeclaration(
  declaration: ApmDependencyDeclaration,
  resolvedIds: ReadonlySet<string>,
): boolean {
  return declaration.resolvedPackageId !== undefined && resolvedIds.has(declaration.resolvedPackageId);
}

/*** Represent a declaration with no lock target as first-class stale-lock evidence. */
function unresolvedDeclaration(
  root: ApmInstallRootInventory,
  declaration: ApmDependencyDeclaration,
  availabilityEvidence: ApmAvailabilityEvidence,
): ApmStatusDependency {
  const packageId = `decl:${root.id}:${declaration.ownerPath}:${declaration.name}`;
  const availability = findAvailability(packageId, declaration.name, availabilityEvidence);
  const findings: ApmStatusFinding[] = [{
    code: 'lock-stale',
    scope: { kind: 'package', id: packageId },
    evidence: [`${declaration.ownerPath}: ${declaration.name}@${declaration.range}`],
    reason: 'The declared dependency has no matching locked package instance.',
    nextAction: 'Regenerate the selected package-manager lockfile.',
  }];
  if (availability.state === 'unknown') findings.push(unknownAvailabilityFinding(packageId, availability));
  return {
    packageId,
    installRootId: root.id,
    name: declaration.name,
    direct: true,
    declaration,
    installed: unknownInstallation(declaration.resolvedPackageId ?? packageId),
    availability,
    dependencyPaths: [],
    findings,
  };
}

/*** Build unknown availability for a missing registry response rather than treating it as current. */
function findAvailability(
  packageId: string,
  name: string,
  availability: ApmAvailabilityEvidence,
): ApmPackageAvailabilityEvidence {
  return availability.packages.find((item) => item.packageId === packageId) ?? {
    packageId,
    name,
    state: 'unknown',
    reason: 'No availability evidence was returned for this package instance.',
  };
}

/*** Provide explicit unknown installation evidence when an adapter omitted an instance. */
function unknownInstallation(packageId: string): ApmInstalledPackageEvidence {
  return {
    packageId,
    state: 'unknown',
    source: 'unknown',
    reason: 'No installed-state evidence was returned for this package instance.',
  };
}

/*** Build availability-unknown finding for an unresolved declaration. */
function unknownAvailabilityFinding(
  packageId: string,
  availability: ApmPackageAvailabilityEvidence,
): ApmStatusFinding {
  return {
    code: 'availability-unknown',
    scope: { kind: 'package', id: packageId },
    evidence: [availability.reason ?? 'Registry availability evidence is unavailable.'],
    reason: 'Available package versions could not be established.',
    nextAction: 'Refresh registry evidence with working registry access.',
  };
}

/*** Create stable cross-root package identity without modifying manager-native instance IDs. */
function globalPackageId(rootId: string, packageId: string): string {
  return `${rootId}::${packageId}`;
}

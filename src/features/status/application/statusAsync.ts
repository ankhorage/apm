import type {
  ApmAvailabilityRequest,
  ApmDependencyInventory,
  ApmExtensionEvidence,
  ApmStatusHostPackage,
  ApmStatusInput,
  ApmStatusPorts,
  ApmStatusResult,
} from '../../../types/status.js';
import { evaluateStatus } from '../domain/evaluateStatus.js';

/***
 * Build evidence-based, serializable APM status without mutating the inspected project.
 *
 * The use case separates Project Detector evidence, package-manager inventory, registry
 * availability, and optional package-owned projection/migration evidence behind outbound ports.
 * Missing or partial evidence makes currency `unknown`; it never becomes a green current result.
 * Hosts can call this boundary without a terminal and can test it with deterministic fake ports.
 * @readme
 */
export async function statusAsync(input: ApmStatusInput, ports: ApmStatusPorts): Promise<ApmStatusResult> {
  const inspection = await ports.projectInspection.inspectProjectAsync(input.rootPath);
  const inventory = await ports.dependencyInventory.inspectDependencyInventoryAsync({ inspection });
  const hostPackages = input.hostPackages ?? [];
  const availability = await ports.availability.queryAvailabilityAsync({
    rootPath: inspection.rootPath,
    mode: input.availability ?? 'refresh',
    packages: buildAvailabilityRequests(inventory, hostPackages),
  });
  const extensions = await readExtensionEvidenceAsync(
    inspection.rootPath,
    inventory,
    ports.extensions,
  );
  return evaluateStatus({ inspection, inventory, availability, extensions, hostPackages });
}

/*** Build registry requests for every lock instance, unresolved direct declaration, and host. */
function buildAvailabilityRequests(
  inventory: ApmDependencyInventory,
  hosts: readonly ApmStatusHostPackage[],
): readonly ApmAvailabilityRequest[] {
  const application = inventory.roots.flatMap((root) => {
    const declarationsByPackage = new Map(
      root.declarations.flatMap((declaration) =>
        declaration.resolvedPackageId === undefined
          ? []
          : [[declaration.resolvedPackageId, declaration] as const],
      ),
    );
    const locked = root.lockedPackages.map((pkg) => {
      const declaration = declarationsByPackage.get(pkg.id);
      return {
        packageId: `${root.id}::${pkg.id}`,
        name: pkg.name,
        role: 'application' as const,
        ...(pkg.version === undefined ? {} : { currentVersion: pkg.version }),
        ...(declaration === undefined ? {} : { declaredRange: declaration.range }),
      };
    });
    const resolved = new Set(root.lockedPackages.map((pkg) => pkg.id));
    const unresolved = root.declarations
      .filter(
        (declaration) =>
          declaration.resolvedPackageId === undefined || !resolved.has(declaration.resolvedPackageId),
      )
      .map((declaration) => ({
        packageId: `decl:${root.id}:${declaration.ownerPath}:${declaration.name}`,
        name: declaration.name,
        role: 'application' as const,
        declaredRange: declaration.range,
      }));
    return [...locked, ...unresolved];
  });
  return [
    ...application,
    ...hosts.map((host) => ({
      packageId: `host:${host.id}`,
      name: host.name,
      role: 'host' as const,
      currentVersion: host.version,
      ...(host.declaredRange === undefined ? {} : { declaredRange: host.declaredRange }),
    })),
  ];
}

/*** Keep extension protocol optional until #4 publishes package-owned extension discovery. */
async function readExtensionEvidenceAsync(
  rootPath: string,
  inventory: ApmDependencyInventory,
  port: ApmStatusPorts['extensions'],
): Promise<ApmExtensionEvidence> {
  if (port !== undefined) {
    return port.inspectExtensionEvidenceAsync({ rootPath, inventory });
  }
  return {
    state: 'unavailable',
    complete: true,
    observations: [],
    diagnostics: [],
  };
}

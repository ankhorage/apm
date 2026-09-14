import type {
  ApmDependencyInventory,
  ApmExtensionEvidence,
  ApmStatusInput,
  ApmStatusPorts,
  ApmStatusResult,
} from '../../../types/status.js';
import { evaluateStatus } from '../domain/evaluateStatus.js';
import { buildAvailabilityRequests } from './buildAvailabilityRequests.js';

/***
 * Build evidence-based, serializable APM status without mutating the inspected project.
 *
 * The use case separates Project Detector evidence, package-manager inventory, registry
 * availability, and optional package-owned projection/migration evidence behind outbound ports.
 * Missing or partial evidence makes currency `unknown`; it never becomes a green current result.
 * Hosts can call this boundary without a terminal and can test it with deterministic fake ports.
 * @readme
 */
export async function statusAsync(
  input: ApmStatusInput,
  ports: ApmStatusPorts,
): Promise<ApmStatusResult> {
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

/*** Keep extension protocol optional until #4 publishes package-owned extension discovery. */
async function readExtensionEvidenceAsync(
  rootPath: string,
  inventory: ApmDependencyInventory,
  port: ApmStatusPorts['extensions'],
): Promise<ApmExtensionEvidence> {
  if (port !== undefined) return port.inspectExtensionEvidenceAsync({ rootPath, inventory });
  return {
    state: 'unavailable',
    complete: true,
    observations: [],
    diagnostics: [],
  };
}

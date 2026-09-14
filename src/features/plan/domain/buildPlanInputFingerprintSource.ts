import type { ApmPlanPolicy } from '../../../types/plan.js';
import type {
  ApmInstallRootInventory,
  ApmPackageAvailabilityEvidence,
  ApmStatusDependency,
  ApmStatusDiagnostic,
  ApmStatusFinding,
  ApmStatusResult,
} from '../../../types/status.js';

/*** Serialize only planning-relevant status and policy evidence in stable identity order. */
export function buildPlanInputFingerprintSource(
  status: ApmStatusResult,
  policy: ApmPlanPolicy,
): string {
  return JSON.stringify({
    schemaVersion: status.schemaVersion,
    rootPath: status.rootPath,
    complete: status.complete,
    currency: status.currency,
    installRoots: [...status.installRoots].sort(compareInstallRoots).map(installRootSnapshot),
    dependencies: [...status.dependencies].sort(compareDependencies).map(dependencySnapshot),
    hosts: [...status.hosts].sort((left, right) => compareText(left.id, right.id)).map(hostSnapshot),
    extensions: {
      state: status.extensions.state,
      complete: status.extensions.complete,
      observations: [...status.extensions.observations].sort((left, right) =>
        compareText(observationKey(left), observationKey(right)),
      ),
      diagnostics: stableDiagnostics(status.extensions.diagnostics),
    },
    findings: stableFindings(status.findings),
    diagnostics: stableDiagnostics(status.diagnostics),
    policy: policySnapshot(policy),
  });
}

/*** Preserve install-root manager, declarations and graph identity without discovery-order dependence. */
function installRootSnapshot(root: ApmInstallRootInventory): object {
  return {
    id: root.id,
    rootPath: root.rootPath,
    packagePaths: [...root.packagePaths].sort(compareText),
    manager: root.manager,
    ...(root.linker === undefined ? {} : { linker: root.linker }),
    lockfile: root.lockfile,
    declarations: [...root.declarations].sort((left, right) =>
      compareText(
        `${left.ownerPath}\0${left.kind}\0${left.name}`,
        `${right.ownerPath}\0${right.kind}\0${right.name}`,
      ),
    ),
    lockedPackages: [...root.lockedPackages].sort((left, right) => compareText(left.id, right.id)),
    installedPackages: [...root.installedPackages].sort((left, right) =>
      compareText(left.packageId, right.packageId),
    ),
    complete: root.complete,
    diagnostics: stableDiagnostics(root.diagnostics),
  };
}

/*** Preserve dependency availability, declaration, paths and findings at stable package identity. */
function dependencySnapshot(dependency: ApmStatusDependency): object {
  return {
    packageId: dependency.packageId,
    installRootId: dependency.installRootId,
    name: dependency.name,
    direct: dependency.direct,
    ...(dependency.declaration === undefined ? {} : { declaration: dependency.declaration }),
    ...(dependency.lockedVersion === undefined ? {} : { lockedVersion: dependency.lockedVersion }),
    installed: dependency.installed,
    availability: availabilitySnapshot(dependency.availability),
    dependencyPaths: [...dependency.dependencyPaths]
      .map((path) => [...path])
      .sort((left, right) => compareText(left.join('\0'), right.join('\0'))),
    findings: stableFindings(dependency.findings),
  };
}

/*** Preserve host availability without coupling freshness timestamps to fingerprint validity. */
function hostSnapshot(host: ApmStatusResult['hosts'][number]): object {
  return {
    id: host.id,
    name: host.name,
    version: host.version,
    ...(host.declaredRange === undefined ? {} : { declaredRange: host.declaredRange }),
    availability: availabilitySnapshot(host.availability),
    findings: stableFindings(host.findings),
  };
}

/*** Remove checkedAt freshness from semantic availability evidence before hashing. */
function availabilitySnapshot(availability: ApmPackageAvailabilityEvidence): object {
  return {
    packageId: availability.packageId,
    name: availability.name,
    state: availability.state,
    ...(availability.registry === undefined ? {} : { registry: availability.registry }),
    ...(availability.latestVersion === undefined ? {} : { latestVersion: availability.latestVersion }),
    ...(availability.compatibleVersion === undefined
      ? {}
      : { compatibleVersion: availability.compatibleVersion }),
    ...(availability.reason === undefined ? {} : { reason: availability.reason }),
  };
}

/*** Normalize user selections so policy object/array order cannot change the plan fingerprint. */
function policySnapshot(policy: ApmPlanPolicy): object {
  return {
    dependencyUpdates: policy.dependencyUpdates,
    selections: [...policy.selections].sort((left, right) =>
      compareText(selectionKey(left), selectionKey(right)),
    ),
    repairInstallations: policy.repairInstallations,
    repairProjections: policy.repairProjections,
    maxGeneratorIterations: policy.maxGeneratorIterations,
  };
}

/*** Build one stable selection identity including the explicit target intent. */
function selectionKey(selection: ApmPlanPolicy['selections'][number]): string {
  const { selector, target } = selection;
  const selectorKey = [
    selector.name,
    selector.packageId ?? '',
    selector.installRootId ?? '',
    selector.ownerPath ?? '',
  ].join('\0');
  if (target.kind === 'compatible') return `${selectorKey}\0compatible`;
  if (target.kind === 'latest') {
    return [
      selectorKey,
      'latest',
      String(target.allowPrerelease ?? false),
      target.manifestRange ?? '',
    ].join('\0');
  }
  return [
    selectorKey,
    'version',
    target.version,
    String(target.allowPrerelease ?? false),
    String(target.allowDowngrade ?? false),
    target.manifestRange ?? '',
  ].join('\0');
}

/*** Sort findings by code, scope and evidence while preserving their complete payload. */
function stableFindings(findings: readonly ApmStatusFinding[]): readonly ApmStatusFinding[] {
  return [...findings].sort((left, right) => compareText(findingKey(left), findingKey(right)));
}

/*** Sort diagnostics by code, scope and evidence while preserving their complete payload. */
function stableDiagnostics(
  diagnostics: readonly ApmStatusDiagnostic[],
): readonly ApmStatusDiagnostic[] {
  return [...diagnostics].sort((left, right) => compareText(diagnosticKey(left), diagnosticKey(right)));
}

/*** Build a stable finding comparison key. */
function findingKey(finding: ApmStatusFinding): string {
  return [
    finding.code,
    finding.scope.kind,
    finding.scope.id ?? '',
    finding.scope.path ?? '',
    ...finding.evidence,
  ].join('\0');
}

/*** Build a stable diagnostic comparison key. */
function diagnosticKey(diagnostic: ApmStatusDiagnostic): string {
  return [
    diagnostic.code,
    diagnostic.severity,
    diagnostic.scope.kind,
    diagnostic.scope.id ?? '',
    diagnostic.scope.path ?? '',
    ...diagnostic.evidence,
  ].join('\0');
}

/*** Build a stable extension observation key. */
function observationKey(observation: ApmStatusResult['extensions']['observations'][number]): string {
  return [
    observation.owner ?? '',
    observation.packageId ?? '',
    observation.projection,
    observation.migration,
    ...observation.evidence,
  ].join('\0');
}

/*** Sort install roots by canonical root ID. */
function compareInstallRoots(left: ApmInstallRootInventory, right: ApmInstallRootInventory): number {
  return compareText(left.id, right.id);
}

/*** Sort dependencies by install-root and package-instance identity. */
function compareDependencies(left: ApmStatusDependency, right: ApmStatusDependency): number {
  return compareText(
    `${left.installRootId}\0${left.packageId}`,
    `${right.installRootId}\0${right.packageId}`,
  );
}

/*** Compare stable strings without locale-dependent ordering. */
function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

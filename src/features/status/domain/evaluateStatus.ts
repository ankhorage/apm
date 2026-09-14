import type { ProjectInspection } from '@ankhorage/project-detector/types';
import { gt, satisfies, valid, validRange } from 'semver';

import type {
  ApmAvailabilityEvidence,
  ApmDependencyDeclaration,
  ApmDependencyInventory,
  ApmExtensionEvidence,
  ApmInstalledPackageEvidence,
  ApmInstallRootInventory,
  ApmLockedPackageEvidence,
  ApmPackageAvailabilityEvidence,
  ApmStatusDependency,
  ApmStatusDiagnostic,
  ApmStatusFinding,
  ApmStatusHostPackage,
  ApmStatusHostPackageResult,
  ApmStatusResult,
} from '../../../types/status.js';

/*** Combine independent evidence sources into one conservative status result. */
export function evaluateStatus(input: EvaluateStatusInput): ApmStatusResult {
  const dependencies = input.inventory.roots.flatMap((root) =>
    buildRootDependencies(root, input.availability),
  );
  const hosts = input.hostPackages.map((host) => buildHostStatus(host, input.availability));
  const extensionFindings = buildExtensionFindings(input.extensions);
  const findings = [
    ...dependencies.flatMap((dependency) => dependency.findings),
    ...hosts.flatMap((host) => host.findings),
    ...extensionFindings,
  ];
  const diagnostics = [
    ...input.inspection.diagnostics.map(toInspectionDiagnostic),
    ...input.inventory.diagnostics,
    ...input.availability.diagnostics,
    ...input.extensions.diagnostics,
  ];
  const complete =
    input.inspection.complete &&
    input.inventory.complete &&
    input.availability.complete &&
    input.extensions.complete;

  return {
    schemaVersion: 2,
    operation: 'status',
    rootPath: input.inspection.rootPath,
    complete,
    currency: !complete ? 'unknown' : findings.length > 0 ? 'outdated' : 'current',
    project: {
      traits: [...input.inspection.detection.traits],
      languages: input.inspection.detection.languages.map((language) => ({
        id: language.id,
        score: language.score,
        sourceRoots: [...language.sourceRoots],
      })),
      packageManagers: [...input.inspection.detection.packageManagers],
      buildTools: [...input.inspection.detection.buildTools],
      packageCount: input.inspection.packages.length,
      workspaceCount: input.inspection.workspaces.length,
    },
    installRoots: input.inventory.roots,
    dependencies,
    hosts,
    extensions: input.extensions,
    findings,
    diagnostics,
  };
}

interface EvaluateStatusInput {
  readonly inspection: ProjectInspection;
  readonly inventory: ApmDependencyInventory;
  readonly availability: ApmAvailabilityEvidence;
  readonly extensions: ApmExtensionEvidence;
  readonly hostPackages: readonly ApmStatusHostPackage[];
}

/*** Build package-level status while preserving every lockfile instance identity. */
function buildRootDependencies(
  root: ApmInstallRootInventory,
  availability: ApmAvailabilityEvidence,
): readonly ApmStatusDependency[] {
  const installedByPackage = new Map(
    root.installedPackages.map((installed) => [installed.packageId, installed]),
  );
  const declarationsByPackage = new Map<string, ApmDependencyDeclaration>();
  for (const declaration of root.declarations) {
    if (declaration.resolvedPackageId !== undefined) {
      declarationsByPackage.set(declaration.resolvedPackageId, declaration);
    }
  }
  const pathsByPackage = buildDependencyPaths(root);
  const locked = root.lockedPackages.map((pkg) => {
    const packageId = globalPackageId(root.id, pkg.id);
    const declaration = declarationsByPackage.get(pkg.id);
    const installed = installedByPackage.get(pkg.id) ?? unknownInstallation(pkg.id);
    return buildDependencyStatus({
      root,
      pkg,
      packageId,
      installed,
      availability: findAvailability(packageId, pkg.name, availability),
      paths: pathsByPackage.get(pkg.id) ?? [],
      ...(declaration === undefined ? {} : { declaration }),
    });
  });
  const resolvedIds = new Set(root.lockedPackages.map((pkg) => pkg.id));
  const unresolved = root.declarations
    .filter(
      (declaration) =>
        declaration.resolvedPackageId === undefined || !resolvedIds.has(declaration.resolvedPackageId),
    )
    .map((declaration) => buildUnresolvedDeclaration(root, declaration, availability));
  return [...locked, ...unresolved];
}

/*** Build one dependency status and derive drift findings only from explicit evidence. */
function buildDependencyStatus(input: BuildDependencyStatusInput): ApmStatusDependency {
  const findings = [
    ...buildDeclarationFindings(input),
    ...buildInstallationFindings(input),
    ...buildAvailabilityFindings(input),
  ];
  return {
    packageId: input.packageId,
    installRootId: input.root.id,
    name: input.pkg.name,
    direct: input.declaration !== undefined,
    ...(input.declaration === undefined ? {} : { declaration: input.declaration }),
    ...(input.pkg.version === undefined ? {} : { lockedVersion: input.pkg.version }),
    installed: input.installed,
    availability: input.availability,
    dependencyPaths: input.paths,
    findings,
  };
}

interface BuildDependencyStatusInput {
  readonly root: ApmInstallRootInventory;
  readonly pkg: ApmLockedPackageEvidence;
  readonly packageId: string;
  readonly declaration?: ApmDependencyDeclaration;
  readonly installed: ApmInstalledPackageEvidence;
  readonly availability: ApmPackageAvailabilityEvidence;
  readonly paths: readonly (readonly string[])[];
}

/*** Detect a changed declaration only when both sides are valid semantic-version evidence. */
function buildDeclarationFindings(input: BuildDependencyStatusInput): readonly ApmStatusFinding[] {
  if (
    input.declaration === undefined ||
    input.pkg.version === undefined ||
    valid(input.pkg.version) === null ||
    validRange(input.declaration.range) === null ||
    satisfies(input.pkg.version, input.declaration.range)
  ) {
    return [];
  }
  const scope = packageScope(input.packageId);
  const evidence = [
    `${input.declaration.ownerPath}: ${input.pkg.name}@${input.declaration.range}`,
    `${input.root.lockfile.path ?? 'lockfile'}: ${input.pkg.version}`,
  ];
  return [
    {
      code: 'declared-changed',
      scope,
      evidence,
      reason: 'The declared dependency constraint no longer accepts the locked version.',
      nextAction: 'Regenerate the lockfile through the selected package manager.',
    },
    {
      code: 'lock-stale',
      scope,
      evidence,
      reason: 'The lockfile resolution is stale relative to the package declaration.',
      nextAction: 'Resolve dependencies again before applying package changes.',
    },
  ];
}

/*** Report absence separately from an unknown installation state. */
function buildInstallationFindings(input: BuildDependencyStatusInput): readonly ApmStatusFinding[] {
  if (input.installed.state !== 'absent') return [];
  return [
    {
      code: 'install-absent',
      scope: packageScope(input.packageId),
      evidence: [input.installed.reason ?? 'No installed package evidence was found.'],
      reason: 'The locked package instance is not installed at the inspected project state.',
      nextAction: 'Install dependencies with the selected package manager before verification.',
    },
  ];
}

/*** Compare known availability with current lock evidence without inventing missing versions. */
function buildAvailabilityFindings(input: BuildDependencyStatusInput): readonly ApmStatusFinding[] {
  if (input.availability.state === 'unknown') {
    return [
      {
        code: 'availability-unknown',
        scope: packageScope(input.packageId),
        evidence: [input.availability.reason ?? 'Registry availability evidence is unavailable.'],
        reason: 'Available package versions could not be established.',
        nextAction: 'Refresh registry evidence with working registry access.',
      },
    ];
  }
  const current = input.pkg.version;
  const latest = input.availability.latestVersion;
  if (current === undefined || latest === undefined || valid(current) === null || !gt(latest, current)) {
    return [];
  }
  if (input.declaration === undefined) {
    return [
      {
        code: 'transitive-update',
        scope: packageScope(input.packageId),
        evidence: [`locked ${current}`, `latest ${latest}`],
        reason: 'A newer version exists for this transitive package instance.',
      },
    ];
  }
  const compatible = input.availability.compatibleVersion;
  if (compatible !== undefined && valid(compatible) !== null && gt(compatible, current)) {
    return [
      {
        code: 'direct-update',
        scope: packageScope(input.packageId),
        evidence: [`locked ${current}`, `compatible ${compatible}`, `latest ${latest}`],
        reason: 'A newer version is available within the declared dependency constraint.',
      },
    ];
  }
  return [
    {
      code: 'constraint-blocked',
      scope: packageScope(input.packageId),
      evidence: [`locked ${current}`, `declared ${input.declaration.range}`, `latest ${latest}`],
      reason: 'A newer version exists but the current declaration does not admit it.',
      nextAction: 'Review the declaration before planning a constraint-changing update.',
    },
  ];
}

/*** Represent a declaration with no lock target as a first-class stale-lock dependency. */
function buildUnresolvedDeclaration(
  root: ApmInstallRootInventory,
  declaration: ApmDependencyDeclaration,
  availabilityEvidence: ApmAvailabilityEvidence,
): ApmStatusDependency {
  const packageId = `decl:${root.id}:${declaration.ownerPath}:${declaration.name}`;
  const availability = findAvailability(packageId, declaration.name, availabilityEvidence);
  const findings: ApmStatusFinding[] = [
    {
      code: 'lock-stale',
      scope: packageScope(packageId),
      evidence: [`${declaration.ownerPath}: ${declaration.name}@${declaration.range}`],
      reason: 'The declared dependency has no matching locked package instance.',
      nextAction: 'Regenerate the selected package-manager lockfile.',
    },
  ];
  if (availability.state === 'unknown') {
    findings.push({
      code: 'availability-unknown',
      scope: packageScope(packageId),
      evidence: [availability.reason ?? 'Registry availability evidence is unavailable.'],
      reason: 'Available package versions could not be established.',
      nextAction: 'Refresh registry evidence with working registry access.',
    });
  }
  return {
    packageId,
    installRootId: root.id,
    name: declaration.name,
    direct: true,
    declaration,
    installed: {
      packageId: declaration.resolvedPackageId ?? packageId,
      state: 'unknown',
      source: 'unknown',
      reason: 'No locked package instance exists to map installation evidence.',
    },
    availability,
    dependencyPaths: [],
    findings,
  };
}

/*** Derive bounded dependency paths from direct declarations without collapsing duplicate versions. */
function buildDependencyPaths(
  root: ApmInstallRootInventory,
): ReadonlyMap<string, readonly (readonly string[])[]> {
  const packagesById = new Map(root.lockedPackages.map((pkg) => [pkg.id, pkg]));
  const directIds = root.declarations.flatMap((declaration) =>
    declaration.resolvedPackageId === undefined ? [] : [declaration.resolvedPackageId],
  );
  const paths = new Map<string, string[][]>();
  const queue = directIds.map((id) => ({ id, path: [globalPackageId(root.id, id)] }));
  for (const item of queue) {
    const existing = paths.get(item.id) ?? [];
    if (existing.length >= 8 || item.path.length > 64) continue;
    if (existing.some((candidate) => candidate.join('\u0000') === item.path.join('\u0000'))) continue;
    paths.set(item.id, [...existing, item.path]);
    const pkg = packagesById.get(item.id);
    if (pkg === undefined) continue;
    for (const edge of pkg.dependencies) {
      if (edge.packageId === undefined || item.path.includes(globalPackageId(root.id, edge.packageId))) {
        continue;
      }
      queue.push({
        id: edge.packageId,
        path: [...item.path, globalPackageId(root.id, edge.packageId)],
      });
    }
  }
  return paths;
}

/*** Convert extension projection and migration states into package-independent findings. */
function buildExtensionFindings(extensions: ApmExtensionEvidence): readonly ApmStatusFinding[] {
  return extensions.observations.flatMap((observation, index) => {
    const id = observation.packageId ?? observation.owner ?? `extension:${index}`;
    const findings: ApmStatusFinding[] = [];
    if (observation.projection === 'stale') {
      findings.push({
        code: 'projection-stale',
        scope: { kind: 'projection', id },
        evidence: observation.evidence,
        reason: observation.reason ?? 'An owned generated projection differs from current source state.',
        ...(observation.nextAction === undefined ? {} : { nextAction: observation.nextAction }),
      });
    }
    if (observation.migration === 'pending') {
      findings.push({
        code: 'migration-pending',
        scope: { kind: 'migration', id },
        evidence: observation.evidence,
        reason: observation.reason ?? 'A package-owned migration is pending for this project state.',
        ...(observation.nextAction === undefined ? {} : { nextAction: observation.nextAction }),
      });
    }
    return findings;
  });
}

/*** Compare host package versions separately from application dependency instances. */
function buildHostStatus(
  host: ApmStatusHostPackage,
  availability: ApmAvailabilityEvidence,
): ApmStatusHostPackageResult {
  const packageId = `host:${host.id}`;
  const evidence = findAvailability(packageId, host.name, availability);
  const findings: ApmStatusFinding[] = [];
  if (evidence.state === 'unknown') {
    findings.push({
      code: 'availability-unknown',
      scope: { kind: 'host', id: host.id },
      evidence: [evidence.reason ?? 'Registry availability evidence is unavailable.'],
      reason: 'Host package availability could not be established.',
    });
  } else if (
    evidence.latestVersion !== undefined &&
    valid(host.version) !== null &&
    gt(evidence.latestVersion, host.version)
  ) {
    findings.push({
      code: 'host-update',
      scope: { kind: 'host', id: host.id },
      evidence: [`installed host ${host.version}`, `latest ${evidence.latestVersion}`],
      reason: 'A newer host or extension package is available separately from application updates.',
      nextAction: 'Upgrade the host at its own restart boundary before dependent updates when required.',
    });
  }
  return { ...host, availability: evidence, findings };
}

/*** Look up availability by stable request identity and fall back to explicit unknown evidence. */
function findAvailability(
  packageId: string,
  name: string,
  availability: ApmAvailabilityEvidence,
): ApmPackageAvailabilityEvidence {
  const found = availability.packages.find((item) => item.packageId === packageId);
  return (
    found ?? {
      packageId,
      name,
      state: 'unknown',
      reason: 'No availability evidence was returned for this package instance.',
    }
  );
}

/*** Normalize Project Detector diagnostics into APM's stable diagnostic shape. */
function toInspectionDiagnostic(
  diagnostic: ProjectInspection['diagnostics'][number],
): ApmStatusDiagnostic {
  return {
    code: `project-detector.${diagnostic.code}`,
    severity: 'warning',
    scope: {
      kind: 'project',
      ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
    },
    evidence: diagnostic.path === undefined ? [] : [diagnostic.path],
    reason: diagnostic.message,
    nextAction: 'Resolve the incomplete project inspection evidence before treating status as current.',
  };
}

/*** Create stable cross-root package identity without modifying manager-native instance IDs. */
function globalPackageId(rootId: string, packageId: string): string {
  return `${rootId}::${packageId}`;
}

/*** Provide explicit unknown installation evidence when an adapter omitted an instance. */
function unknownInstallation(packageId: string): ApmInstalledPackageEvidence {
  return {
    packageId,
    state: 'unknown',
    source: 'unknown',
    reason: 'The package-manager adapter returned no installation evidence for this lock instance.',
  };
}

/*** Build the common package diagnostic scope. */
function packageScope(packageId: string): ApmStatusDiagnosticScopeWithId {
  return { kind: 'package', id: packageId };
}

type ApmStatusDiagnosticScopeWithId = {
  readonly kind: 'package';
  readonly id: string;
};

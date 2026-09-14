import type { ProjectInspection } from '@ankhorage/project-detector/types';

export type ApmStatusCurrency = 'current' | 'outdated' | 'unknown';

export type ApmStatusAvailabilityMode = 'refresh' | 'offline';

export type ApmPackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun';

export type ApmDependencyKind =
  'dependency' | 'development' | 'optional' | 'peer' | 'peer-optional';

export type ApmInstallationState = 'present' | 'absent' | 'unknown';

export type ApmProjectionState = 'current' | 'stale' | 'unknown' | 'not-applicable';

export type ApmMigrationState = 'current' | 'pending' | 'unknown' | 'not-applicable';

export type ApmStatusFindingCode =
  | 'declared-changed'
  | 'lock-stale'
  | 'install-absent'
  | 'direct-update'
  | 'transitive-update'
  | 'constraint-blocked'
  | 'projection-stale'
  | 'migration-pending'
  | 'availability-unknown'
  | 'host-update';

export interface ApmStatusInput {
  readonly rootPath: string;
  readonly availability?: ApmStatusAvailabilityMode;
  readonly hostPackages?: readonly ApmStatusHostPackage[];
}

export interface ApmStatusHostPackage {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly declaredRange?: string;
}

export interface ApmStatusDiagnosticScope {
  readonly kind:
    'project' | 'install-root' | 'package' | 'registry' | 'projection' | 'migration' | 'host';
  readonly id?: string;
  readonly path?: string;
}

export interface ApmStatusDiagnostic {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly scope: ApmStatusDiagnosticScope;
  readonly evidence: readonly string[];
  readonly reason: string;
  readonly nextAction?: string;
}

export interface ApmStatusFinding {
  readonly code: ApmStatusFindingCode;
  readonly scope: ApmStatusDiagnosticScope;
  readonly evidence: readonly string[];
  readonly reason: string;
  readonly nextAction?: string;
}

export interface ApmStatusLanguage {
  readonly id: string;
  readonly score: number;
  readonly sourceRoots: readonly string[];
}

export interface ApmStatusProjectSummary {
  readonly traits: readonly string[];
  readonly languages: readonly ApmStatusLanguage[];
  readonly packageManagers: readonly string[];
  readonly buildTools: readonly string[];
  readonly packageCount: number;
  readonly workspaceCount: number;
}

export interface ApmStatusProjectInspectionPort {
  readonly inspectProjectAsync: (rootPath: string) => Promise<ProjectInspection>;
}

export interface ApmDependencyDeclaration {
  readonly ownerPath: string;
  readonly name: string;
  readonly range: string;
  readonly kind: ApmDependencyKind;
  readonly resolvedPackageId?: string;
}

export interface ApmLockedDependencyEdge {
  readonly name: string;
  readonly requested: string;
  readonly packageId?: string;
}

export interface ApmLockedPackageEvidence {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly source: 'registry' | 'workspace' | 'file' | 'git' | 'unknown';
  readonly optional: boolean;
  readonly peerContext?: string;
  readonly location?: string;
  readonly dependencies: readonly ApmLockedDependencyEdge[];
}

export interface ApmInstalledPackageEvidence {
  readonly packageId: string;
  readonly state: ApmInstallationState;
  readonly source:
    'node-modules' | 'pnpm-store' | 'yarn-state' | 'pnp-data' | 'bun-store' | 'unknown';
  readonly version?: string;
  readonly location?: string;
  readonly reason?: string;
}

export interface ApmPackageManagerEvidence {
  readonly state: 'selected' | 'conflict' | 'unknown';
  readonly name?: ApmPackageManagerName;
  readonly version?: string;
  readonly source?: 'package-manager-field' | 'lockfile' | 'project-detector';
}

export interface ApmLockfileEvidence {
  readonly state: 'supported' | 'unsupported' | 'missing' | 'conflict';
  readonly path?: string;
  readonly format?: string;
  readonly version?: string;
  readonly evidence: readonly string[];
}

export interface ApmInstallRootInventory {
  readonly id: string;
  readonly rootPath: string;
  readonly packagePaths: readonly string[];
  readonly manager: ApmPackageManagerEvidence;
  readonly linker?: string;
  readonly lockfile: ApmLockfileEvidence;
  readonly declarations: readonly ApmDependencyDeclaration[];
  readonly lockedPackages: readonly ApmLockedPackageEvidence[];
  readonly installedPackages: readonly ApmInstalledPackageEvidence[];
  readonly complete: boolean;
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

export interface ApmDependencyInventory {
  readonly roots: readonly ApmInstallRootInventory[];
  readonly complete: boolean;
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

export interface ApmStatusDependencyInventoryPort {
  readonly inspectDependencyInventoryAsync: (input: {
    readonly inspection: ProjectInspection;
  }) => Promise<ApmDependencyInventory>;
}

export interface ApmAvailabilityRequest {
  readonly packageId: string;
  readonly name: string;
  readonly role: 'application' | 'host';
  readonly source?: ApmLockedPackageEvidence['source'];
  readonly currentVersion?: string;
  readonly declaredRange?: string;
}

export interface ApmPackageAvailabilityEvidence {
  readonly packageId: string;
  readonly name: string;
  readonly state: 'known' | 'unknown' | 'not-applicable';
  readonly registry?: string;
  readonly checkedAt?: string;
  readonly latestVersion?: string;
  readonly compatibleVersion?: string;
  readonly reason?: string;
}

export interface ApmAvailabilityEvidence {
  readonly complete: boolean;
  readonly packages: readonly ApmPackageAvailabilityEvidence[];
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

export interface ApmStatusAvailabilityPort {
  readonly queryAvailabilityAsync: (input: {
    readonly rootPath: string;
    readonly mode: ApmStatusAvailabilityMode;
    readonly packages: readonly ApmAvailabilityRequest[];
  }) => Promise<ApmAvailabilityEvidence>;
}

export interface ApmExtensionObservation {
  readonly packageId?: string;
  readonly owner?: string;
  readonly projection: ApmProjectionState;
  readonly migration: ApmMigrationState;
  readonly evidence: readonly string[];
  readonly reason?: string;
  readonly nextAction?: string;
}

export interface ApmExtensionEvidence {
  readonly state: 'available' | 'unavailable';
  readonly complete: boolean;
  readonly observations: readonly ApmExtensionObservation[];
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

export interface ApmStatusExtensionEvidencePort {
  readonly inspectExtensionEvidenceAsync: (input: {
    readonly rootPath: string;
    readonly inventory: ApmDependencyInventory;
  }) => Promise<ApmExtensionEvidence>;
}

export interface ApmStatusPorts {
  readonly projectInspection: ApmStatusProjectInspectionPort;
  readonly dependencyInventory: ApmStatusDependencyInventoryPort;
  readonly availability: ApmStatusAvailabilityPort;
  readonly extensions?: ApmStatusExtensionEvidencePort;
}

export interface ApmStatusDependency {
  readonly packageId: string;
  readonly installRootId: string;
  readonly name: string;
  readonly direct: boolean;
  readonly declaration?: ApmDependencyDeclaration;
  readonly lockedVersion?: string;
  readonly installed: ApmInstalledPackageEvidence;
  readonly availability: ApmPackageAvailabilityEvidence;
  readonly dependencyPaths: readonly (readonly string[])[];
  readonly findings: readonly ApmStatusFinding[];
}

export interface ApmStatusHostPackageResult extends ApmStatusHostPackage {
  readonly availability: ApmPackageAvailabilityEvidence;
  readonly findings: readonly ApmStatusFinding[];
}

export interface ApmStatusResult {
  readonly schemaVersion: 2;
  readonly operation: 'status';
  readonly rootPath: string;
  readonly complete: boolean;
  readonly currency: ApmStatusCurrency;
  readonly project: ApmStatusProjectSummary;
  readonly installRoots: readonly ApmInstallRootInventory[];
  readonly dependencies: readonly ApmStatusDependency[];
  readonly hosts: readonly ApmStatusHostPackageResult[];
  readonly extensions: ApmExtensionEvidence;
  readonly findings: readonly ApmStatusFinding[];
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

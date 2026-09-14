import type { ApmReleaseEffect } from './update-protocol.js';
import type { ApmPackageManagerName, ApmStatusDiagnostic, ApmStatusFinding, ApmStatusResult } from './status.js';

export type ApmPlanDependencyUpdateMode = 'safe' | 'selected' | 'none';

export interface ApmPlanPackageSelector {
  readonly name: string;
  readonly packageId?: string;
  readonly installRootId?: string;
  readonly ownerPath?: string;
}

export type ApmPlanTargetSelection =
  | { readonly kind: 'compatible' }
  | {
      readonly kind: 'latest';
      readonly allowPrerelease?: boolean;
      readonly manifestRange?: string;
    }
  | {
      readonly kind: 'version';
      readonly version: string;
      readonly allowPrerelease?: boolean;
      readonly allowDowngrade?: boolean;
      readonly manifestRange?: string;
    };

export interface ApmPlanPackageSelection {
  readonly selector: ApmPlanPackageSelector;
  readonly target: ApmPlanTargetSelection;
}

export interface ApmPlanPolicyInput {
  readonly dependencyUpdates?: ApmPlanDependencyUpdateMode;
  readonly selections?: readonly ApmPlanPackageSelection[];
  readonly repairInstallations?: boolean;
  readonly repairProjections?: boolean;
  readonly maxGeneratorIterations?: number;
}

export interface ApmPlanPolicy {
  readonly dependencyUpdates: ApmPlanDependencyUpdateMode;
  readonly selections: readonly ApmPlanPackageSelection[];
  readonly repairInstallations: boolean;
  readonly repairProjections: boolean;
  readonly maxGeneratorIterations: number;
}

export type ApmPlanBlockerCode =
  | 'plan.status-incomplete'
  | 'plan.selection-not-found'
  | 'plan.selection-ambiguous'
  | 'plan.target-unavailable'
  | 'plan.target-invalid'
  | 'plan.prerelease-not-allowed'
  | 'plan.downgrade-not-allowed'
  | 'plan.non-registry-selection-unsupported'
  | 'plan.resolution-failed'
  | 'plan.peer-conflict'
  | 'plan.protocol-unavailable'
  | 'plan.generator-nonconvergent'
  | 'plan.step-cycle'
  | 'plan.host-upgrade-required'
  | 'plan.executor-incompatible'
  | 'plan.input-changed'
  | 'plan.native-impact-unknown';

export interface ApmPlanBlockerScope {
  readonly kind: 'project' | 'install-root' | 'package' | 'migration' | 'projection' | 'host';
  readonly id?: string;
  readonly path?: string;
}

export interface ApmPlanBlocker {
  readonly code: ApmPlanBlockerCode | `protocol.${string}`;
  readonly scope: ApmPlanBlockerScope;
  readonly evidence: readonly string[];
  readonly reason: string;
  readonly nextAction?: string;
}

export interface ApmPlanDependencyTarget {
  readonly installRootId: string;
  readonly packageId: string;
  readonly name: string;
  readonly direct: boolean;
  readonly ownerPath?: string;
  readonly kind?: 'dependency' | 'development' | 'optional' | 'peer' | 'peer-optional';
  readonly currentRange?: string;
  readonly currentVersion?: string;
  readonly targetVersion: string;
  readonly targetRange?: string;
  readonly source: 'compatible' | 'latest' | 'exact';
  readonly reason: string;
}

export interface ApmPlanTargetSelectionResult {
  readonly targets: readonly ApmPlanDependencyTarget[];
  readonly blockers: readonly ApmPlanBlocker[];
}

export interface ApmPlanFileChange {
  readonly path: string;
  readonly kind: 'create' | 'update' | 'delete';
  readonly beforeDigest?: string;
  readonly afterDigest?: string;
  readonly beforeContent?: string;
  readonly afterContent?: string;
}

export interface ApmPlanArtifactIdentity {
  readonly id: string;
  readonly packageName: string;
  readonly version: string;
  readonly source: 'registry' | 'workspace' | 'file' | 'git';
  readonly integrity?: string;
  readonly resolved?: string;
}

export interface ApmPlanResolvedPackage {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly direct: boolean;
  readonly source: ApmPlanArtifactIdentity['source'];
  readonly integrity?: string;
  readonly dependencies: readonly string[];
  readonly peerContext?: string;
}

export interface ApmPlanResolutionRequest {
  readonly rootPath: string;
  readonly installRootId: string;
  readonly installRootPath: string;
  readonly packagePaths: readonly string[];
  readonly lockfilePath?: string;
  readonly manager: ApmPackageManagerName;
  readonly managerVersion?: string;
  readonly linker?: string;
  readonly targets: readonly ApmPlanDependencyTarget[];
}

export interface ApmPlanResolutionEffects {
  readonly projectWrites: false;
  readonly lifecycleScripts: false;
  readonly network: 'allowed' | 'offline';
  readonly cache: 'manager-default' | 'isolated';
}

export interface ApmPlanResolutionResult {
  readonly installRootId: string;
  readonly complete: boolean;
  readonly manager: ApmPackageManagerName;
  readonly managerVersion?: string;
  readonly linker?: string;
  readonly files: readonly ApmPlanFileChange[];
  readonly packages: readonly ApmPlanResolvedPackage[];
  readonly artifacts: readonly ApmPlanArtifactIdentity[];
  readonly effects: ApmPlanResolutionEffects;
  readonly blockers: readonly ApmPlanBlocker[];
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

export interface ApmPlanResolutionPort {
  readonly resolveAsync: (input: ApmPlanResolutionRequest) => Promise<ApmPlanResolutionResult>;
}

export interface ApmPlanExecutorIdentity {
  readonly apmVersion: string;
  readonly runtime: 'node' | 'browser' | 'other';
  readonly runtimeVersion?: string;
}

export interface ApmPlanInput {
  readonly status: ApmStatusResult;
  readonly policy?: ApmPlanPolicyInput;
  readonly executor: ApmPlanExecutorIdentity;
}

export interface ApmPlanDigestPort {
  readonly digestAsync: (value: string) => Promise<string>;
}

export interface ApmPlanInputFingerprint {
  readonly value: string;
  readonly statusSchemaVersion: number;
  readonly availabilityCheckedAt: readonly string[];
}

export interface ApmPlanStep {
  readonly id: string;
  readonly kind:
    | 'dependency-files'
    | 'install'
    | 'migration'
    | 'projection'
    | 'validation'
    | 'host-restart'
    | 'follow-up';
  readonly prerequisites: readonly string[];
  readonly installRootId?: string;
  readonly owner?: string;
  readonly reason: string;
  readonly evidence: readonly string[];
}

export interface ApmPlanProtocolRequest {
  readonly status: ApmStatusResult;
  readonly policy: ApmPlanPolicy;
  readonly inputFingerprint: ApmPlanInputFingerprint;
  readonly targets: readonly ApmPlanDependencyTarget[];
  readonly resolutions: readonly ApmPlanResolutionResult[];
}

export interface ApmPlanProtocolResult {
  readonly complete: boolean;
  readonly files: readonly ApmPlanFileChange[];
  readonly artifacts: readonly ApmPlanArtifactIdentity[];
  readonly steps: readonly ApmPlanStep[];
  readonly effects: readonly ApmReleaseEffect[];
  readonly findings: readonly ApmStatusFinding[];
  readonly blockers: readonly ApmPlanBlocker[];
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

export interface ApmPlanProtocolPort {
  readonly planProtocolAsync: (input: ApmPlanProtocolRequest) => Promise<ApmPlanProtocolResult>;
}

export interface ApmPlanPorts {
  readonly digest: ApmPlanDigestPort;
  readonly resolution: ApmPlanResolutionPort;
  readonly protocol?: ApmPlanProtocolPort;
}

export interface ApmPlanResult {
  readonly schemaVersion: 1;
  readonly operation: 'plan';
  readonly id: string;
  readonly rootPath: string;
  readonly complete: boolean;
  readonly policy: ApmPlanPolicy;
  readonly executor: ApmPlanExecutorIdentity;
  readonly inputFingerprint: ApmPlanInputFingerprint;
  readonly targets: readonly ApmPlanDependencyTarget[];
  readonly files: readonly ApmPlanFileChange[];
  readonly packages: readonly ApmPlanResolvedPackage[];
  readonly artifacts: readonly ApmPlanArtifactIdentity[];
  readonly steps: readonly ApmPlanStep[];
  readonly effects: readonly ApmReleaseEffect[];
  readonly findings: readonly ApmStatusFinding[];
  readonly blockers: readonly ApmPlanBlocker[];
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

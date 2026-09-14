export type ApmUpdateProtocolVersion = 1;

export type ApmUpdateDescriptorSchemaVersion = 1;

export type ApmJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ApmJsonValue[]
  | { readonly [key: string]: ApmJsonValue };

export interface ApmPackageUpdateMetadata {
  readonly protocolVersion: ApmUpdateProtocolVersion;
  readonly descriptor: string;
}

export interface ApmUpdateOwnerIdentity {
  readonly name: string;
  readonly version: string;
}

export interface ApmSupportedSourceHistory {
  readonly sourceRange: string;
  readonly stateRevision?: string;
  readonly mode: 'automatic' | 'no-migration';
}

export interface ApmUnsupportedSourceHistory {
  readonly sourceRange: string;
  readonly reason: string;
  readonly nextAction?: string;
}

export interface ApmUpdateHistoryDescriptor {
  readonly supported: readonly ApmSupportedSourceHistory[];
  readonly unsupported: readonly ApmUnsupportedSourceHistory[];
  readonly downgrade: 'unsupported' | 'manual';
}

export interface ApmCompatibilityConstraint {
  readonly kind: 'package' | 'node' | 'host' | 'framework';
  readonly name: string;
  readonly range: string;
  readonly reason?: string;
}

export interface ApmMigrationSource {
  readonly packageRange: string;
  readonly stateRevision?: string;
}

export interface ApmMigrationTarget {
  readonly packageVersion: string;
  readonly stateRevision?: string;
}

export type ApmMigrationArtifactRole = 'source' | 'target' | 'intermediate';

export interface ApmMigrationImplementation {
  readonly artifact: ApmMigrationArtifactRole;
  readonly version?: string;
}

export interface ApmMigrationPrerequisite {
  readonly owner: string;
  readonly migrationId: string;
}

export type ApmProjectScope =
  | {
      readonly kind: 'file';
      readonly path: string;
    }
  | {
      readonly kind: 'json-pointer';
      readonly path: string;
      readonly pointer: string;
    }
  | {
      readonly kind: 'dynamic';
      readonly scope: string;
    };

export type ApmMigrationSideEffect =
  'project-files' | 'package-manifest' | 'package-installation' | 'external-service' | 'manual';

export interface ApmMigrationVerificationRequirement {
  readonly kind: 'extension' | 'manual';
  readonly key?: string;
  readonly description: string;
}

export interface ApmMigrationRecoveryDescriptor {
  readonly idempotent: boolean;
  readonly restartable: boolean;
  readonly reversible: boolean;
  readonly reverseMigrationId?: string;
}

export interface ApmMigrationDescriptor {
  readonly id: string;
  readonly checksum: string;
  readonly from: ApmMigrationSource;
  readonly to: ApmMigrationTarget;
  readonly phase: 'pre-install' | 'post-install';
  readonly implementation: ApmMigrationImplementation;
  readonly prerequisites: readonly ApmMigrationPrerequisite[];
  readonly affectedScopes: readonly ApmProjectScope[];
  readonly sideEffects: readonly ApmMigrationSideEffect[];
  readonly verification: readonly ApmMigrationVerificationRequirement[];
  readonly recovery: ApmMigrationRecoveryDescriptor;
}

export interface ApmProjectionDescriptor {
  readonly id: string;
  readonly claims: readonly ApmProjectScope[];
  readonly requiresExtension: boolean;
  readonly reason?: string;
}

export type ApmReleaseRequirementEffectKind =
  'web-rebuild' | 'web-redeploy' | 'native-binary' | 'backend-prerequisite' | 'manual-review';

export interface ApmReleaseRequirementEffect {
  readonly kind: ApmReleaseRequirementEffectKind;
  readonly requirement: 'required' | 'not-required' | 'unknown';
  readonly evidence: readonly string[];
  readonly reason: string;
}

export interface ApmOtaEligibilityEffect {
  readonly kind: 'ota-eligibility';
  readonly eligibility: 'eligible' | 'not-eligible' | 'unknown';
  readonly evidence: readonly string[];
  readonly reason: string;
}

export type ApmReleaseEffect = ApmReleaseRequirementEffect | ApmOtaEligibilityEffect;

export interface ApmUpdateDescriptor {
  readonly protocolVersion: ApmUpdateProtocolVersion;
  readonly schemaVersion: ApmUpdateDescriptorSchemaVersion;
  readonly owner: ApmUpdateOwnerIdentity;
  readonly history: ApmUpdateHistoryDescriptor;
  readonly compatibility: readonly ApmCompatibilityConstraint[];
  readonly migrations: readonly ApmMigrationDescriptor[];
  readonly projections: readonly ApmProjectionDescriptor[];
  readonly effects: readonly ApmReleaseEffect[];
  readonly extension?: {
    readonly export: string;
  };
}

import type {
  ApmJsonValue,
  ApmMigrationArtifactRole,
  ApmMigrationDescriptor,
  ApmProjectScope,
  ApmProjectionDescriptor,
  ApmUpdateProtocolVersion,
} from './update-protocol.js';
import type { ApmUpdateProtocolBlocker } from './update-validation.js';

export interface ApmExtensionArtifactIdentity {
  readonly role: ApmMigrationArtifactRole;
  readonly packageName: string;
  readonly version: string;
  readonly integrity: string;
  readonly descriptorDigest: string;
}

export interface ApmExtensionExecutionContext {
  readonly owner: string;
  readonly sourceVersion: string;
  readonly targetVersion: string;
  readonly artifact: ApmExtensionArtifactIdentity;
}

export interface ApmProjectFileSnapshot {
  readonly path: string;
  readonly exists: boolean;
  readonly digest?: string;
  readonly encoding?: 'utf8' | 'base64';
  readonly content?: string;
}

export interface ApmExtensionProjectReadPort {
  readonly readFileAsync: (path: string) => Promise<ApmProjectFileSnapshot>;
  readonly listFilesAsync: (scope: ApmProjectScope) => Promise<readonly ApmProjectFileSnapshot[]>;
}

export type ApmProjectMutation =
  | {
      readonly id: string;
      readonly claim: ApmProjectScope;
      readonly kind: 'write-file';
      readonly path: string;
      readonly encoding: 'utf8' | 'base64';
      readonly content: string;
      readonly expectedBeforeDigest?: string;
      readonly afterDigest: string;
    }
  | {
      readonly id: string;
      readonly claim: ApmProjectScope;
      readonly kind: 'delete-file';
      readonly path: string;
      readonly expectedBeforeDigest?: string;
    }
  | {
      readonly id: string;
      readonly claim: ApmProjectScope;
      readonly kind: 'set-json-pointer';
      readonly path: string;
      readonly pointer: string;
      readonly value: ApmJsonValue;
      readonly expectedBeforeDigest?: string;
      readonly afterDigest?: string;
    }
  | {
      readonly id: string;
      readonly claim: ApmProjectScope;
      readonly kind: 'remove-json-pointer';
      readonly path: string;
      readonly pointer: string;
      readonly expectedBeforeDigest?: string;
      readonly afterDigest?: string;
    };

export interface ApmExtensionProjectWritePort {
  readonly applyReviewedMutationAsync: (mutationId: string) => Promise<void>;
}

export interface ApmExtensionVerificationResult {
  readonly valid: boolean;
  readonly evidence: readonly string[];
  readonly reason?: string;
}

export interface ApmMigrationPlanResult {
  readonly migrationId: string;
  readonly mutations: readonly ApmProjectMutation[];
  readonly evidence: readonly string[];
  readonly inputFingerprint: string;
}

export interface ApmMigrationExecutionResult {
  readonly migrationId: string;
  readonly appliedMutationIds: readonly string[];
  readonly evidence: readonly string[];
}

export interface ApmMigrationPlanInput {
  readonly descriptor: ApmMigrationDescriptor;
  readonly context: ApmExtensionExecutionContext;
  readonly project: ApmExtensionProjectReadPort;
}

export interface ApmMigrationExecutionInput {
  readonly descriptor: ApmMigrationDescriptor;
  readonly context: ApmExtensionExecutionContext;
  readonly plan: ApmMigrationPlanResult;
  readonly project: ApmExtensionProjectReadPort & ApmExtensionProjectWritePort;
}

export interface ApmMigrationVerificationInput {
  readonly descriptor: ApmMigrationDescriptor;
  readonly context: ApmExtensionExecutionContext;
  readonly plan: ApmMigrationPlanResult;
  readonly project: ApmExtensionProjectReadPort;
}

export interface ApmMigrationHandler {
  readonly id: string;
  readonly planAsync: (input: ApmMigrationPlanInput) => Promise<ApmMigrationPlanResult>;
  readonly executeAsync: (input: ApmMigrationExecutionInput) => Promise<ApmMigrationExecutionResult>;
  readonly verifyAsync: (
    input: ApmMigrationVerificationInput,
  ) => Promise<ApmExtensionVerificationResult>;
}

export type ApmExtensionInvocationResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly blockers: readonly ApmUpdateProtocolBlocker[];
    };

export interface ApmMigrationPlanInvocation {
  readonly migration: ApmMigrationDescriptor;
  readonly context: ApmExtensionExecutionContext;
  readonly extension: unknown;
  readonly project: ApmExtensionProjectReadPort;
}

export interface ApmMigrationExecutionInvocation {
  readonly migration: ApmMigrationDescriptor;
  readonly context: ApmExtensionExecutionContext;
  readonly extension: unknown;
  readonly plan: ApmMigrationPlanResult;
  readonly project: ApmExtensionProjectReadPort & ApmExtensionProjectWritePort;
}

export interface ApmProjectionInspectionResult {
  readonly projectionId: string;
  readonly state: 'current' | 'stale' | 'unknown';
  readonly inputFingerprint: string;
  readonly generatorFingerprint: string;
  readonly evidence: readonly string[];
  readonly reason?: string;
}

export interface ApmProjectionPlanResult {
  readonly projectionId: string;
  readonly mutations: readonly ApmProjectMutation[];
  readonly inputFingerprint: string;
  readonly generatorFingerprint: string;
  readonly evidence: readonly string[];
}

export interface ApmProjectionInput {
  readonly descriptor: ApmProjectionDescriptor;
  readonly context: ApmExtensionExecutionContext;
  readonly project: ApmExtensionProjectReadPort;
}

export interface ApmProjectionMaterializeInput extends ApmProjectionInput {
  readonly plan: ApmProjectionPlanResult;
  readonly project: ApmExtensionProjectReadPort & ApmExtensionProjectWritePort;
}

export interface ApmProjectionHandler {
  readonly id: string;
  readonly inspectAsync: (input: ApmProjectionInput) => Promise<ApmProjectionInspectionResult>;
  readonly planAsync: (input: ApmProjectionInput) => Promise<ApmProjectionPlanResult>;
  readonly materializeAsync: (input: ApmProjectionMaterializeInput) => Promise<void>;
  readonly verifyAsync: (
    input: ApmProjectionMaterializeInput,
  ) => Promise<ApmExtensionVerificationResult>;
}

export interface ApmUpdateExtension {
  readonly protocolVersion: ApmUpdateProtocolVersion;
  readonly descriptorDigest: string;
  readonly migrations: readonly ApmMigrationHandler[];
  readonly projections: readonly ApmProjectionHandler[];
}

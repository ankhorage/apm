import type { ApmMigrationDescriptor, ApmUpdateDescriptor } from './update-protocol.js';

export type ApmUpdateProtocolBlockerCode =
  | 'protocol.unsupported-version'
  | 'protocol.unsupported-schema'
  | 'protocol.owner-mismatch'
  | 'protocol.invalid-version-range'
  | 'protocol.duplicate-migration-id'
  | 'protocol.duplicate-projection-id'
  | 'protocol.migration-checksum-changed'
  | 'protocol.migration-prerequisite-missing'
  | 'protocol.migration-prerequisite-cycle'
  | 'protocol.migration-path-missing'
  | 'protocol.migration-path-ambiguous'
  | 'protocol.history-unsupported'
  | 'protocol.intermediate-version-required'
  | 'protocol.intermediate-version-unexpected'
  | 'protocol.reversible-migration-missing-reverse'
  | 'protocol.projection-ownership-conflict'
  | 'protocol.extension-required'
  | 'protocol.extension-binding-mismatch'
  | 'protocol.ota-evidence-required';

export interface ApmUpdateProtocolBlocker {
  readonly code: ApmUpdateProtocolBlockerCode;
  readonly scope: {
    readonly kind: 'descriptor' | 'history' | 'migration' | 'projection' | 'extension' | 'effect';
    readonly id?: string;
  };
  readonly evidence: readonly string[];
  readonly reason: string;
  readonly nextAction?: string;
}

export interface ApmUpdateDescriptorValidationInput {
  readonly descriptor: ApmUpdateDescriptor;
  readonly previousDescriptors?: readonly ApmUpdateDescriptor[];
  readonly relatedDescriptors?: readonly ApmUpdateDescriptor[];
  readonly expectedOwner?: {
    readonly name: string;
    readonly version: string;
  };
}

export interface ApmUpdateDescriptorValidationResult {
  readonly valid: boolean;
  readonly blockers: readonly ApmUpdateProtocolBlocker[];
}

export interface ApmMigrationPathInput {
  readonly descriptor: ApmUpdateDescriptor;
  readonly sourceVersion: string;
  readonly sourceStateRevision?: string;
  readonly targetVersion: string;
}

export interface ApmMigrationPathResult {
  readonly supported: boolean;
  readonly noMigrationRequired: boolean;
  readonly migrations: readonly ApmMigrationDescriptor[];
  readonly blockers: readonly ApmUpdateProtocolBlocker[];
}

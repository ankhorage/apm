import type { ApmExtensionArtifactIdentity } from './update-extension.js';
import type { ApmMigrationArtifactRole } from './update-protocol.js';

export interface ApmExtensionArtifactIdentityRequest {
  readonly rootPath: string;
  readonly packageName: string;
  readonly version: string;
  readonly role: ApmMigrationArtifactRole;
  readonly descriptorDigest: string;
}

export type ApmExtensionArtifactIdentityResolution =
  | {
      readonly state: 'resolved';
      readonly artifact: ApmExtensionArtifactIdentity;
      readonly evidence: readonly string[];
    }
  | {
      readonly state: 'unavailable';
      readonly evidence: readonly string[];
      readonly reason: string;
    };

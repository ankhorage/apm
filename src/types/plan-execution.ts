import type { ApmPackageManagerName } from './status.js';
import type {
  ApmExtensionArtifactIdentity,
  ApmMigrationPlanResult,
  ApmProjectionPlanResult,
} from './update-extension.js';
import type {
  ApmMigrationDescriptor,
  ApmProjectionDescriptor,
  ApmReleaseEffect,
} from './update-protocol.js';

export type ApmPlanValidationCheck =
  | {
      readonly id: string;
      readonly kind: 'dependency-state';
    }
  | {
      readonly id: string;
      readonly kind: 'command';
      readonly executable: string;
      readonly args: readonly string[];
      readonly cwd?: string;
      readonly timeoutMs?: number;
    };

export type ApmPlanStepExecution =
  | {
      readonly kind: 'dependency-files';
      readonly filePaths: readonly string[];
    }
  | {
      readonly kind: 'install';
      readonly manager: ApmPackageManagerName;
      readonly managerVersion?: string;
      readonly linker?: string;
      readonly packageIds: readonly string[];
      readonly lifecycleScripts: boolean;
    }
  | {
      readonly kind: 'migration';
      readonly descriptor: ApmMigrationDescriptor;
      readonly artifact: ApmExtensionArtifactIdentity;
      readonly plan: ApmMigrationPlanResult;
    }
  | {
      readonly kind: 'projection';
      readonly descriptor: ApmProjectionDescriptor;
      readonly artifact: ApmExtensionArtifactIdentity;
      readonly plan: ApmProjectionPlanResult;
    }
  | {
      readonly kind: 'validation';
      readonly checks: readonly ApmPlanValidationCheck[];
    }
  | {
      readonly kind: 'host-restart';
      readonly hostId: string;
      readonly requiredVersion: string;
    }
  | {
      readonly kind: 'follow-up';
      readonly effect: ApmReleaseEffect;
    };

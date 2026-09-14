import type { ApmPlanBlocker, ApmPlanExecutorIdentity, ApmPlanResult, ApmPlanStep } from './plan.js';
import type { ApmStatusDiagnostic, ApmStatusResult } from './status.js';

export interface ApmApplyPermissions {
  readonly ownerCode: boolean;
  readonly lifecycleScripts: boolean;
  readonly externalEffects: boolean;
}

export type ApmApplyInput =
  | {
      readonly mode: 'start';
      readonly plan: ApmPlanResult;
      readonly permissions: ApmApplyPermissions;
    }
  | {
      readonly mode: 'resume';
      readonly rootPath: string;
      readonly operationId: string;
      readonly permissions: ApmApplyPermissions;
    };

export type ApmApplyJournalStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'recovery-required';

export type ApmApplyStepState =
  | 'pending'
  | 'intended'
  | 'effect-started'
  | 'effect-observed'
  | 'committed'
  | 'failed'
  | 'cancelled'
  | 'recovery-required';

export interface ApmApplyFailure {
  readonly code: string;
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly nextAction?: string;
}

export interface ApmApplyStepJournal {
  readonly stepId: string;
  readonly state: ApmApplyStepState;
  readonly attempts: number;
  readonly updatedAt: string;
  readonly evidence: readonly string[];
  readonly failure?: ApmApplyFailure;
}

export interface ApmApplyJournal {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly rootPath: string;
  readonly plan: ApmPlanResult;
  readonly permissions: ApmApplyPermissions;
  readonly status: ApmApplyJournalStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly steps: readonly ApmApplyStepJournal[];
  readonly failure?: ApmApplyFailure;
}

export interface ApmApplyLockIdentity {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly planId: string;
  readonly pid: number;
  readonly hostname: string;
  readonly acquiredAt: string;
}

export type ApmApplyLockAcquireResult =
  | {
      readonly state: 'acquired';
      readonly lock: ApmApplyLockIdentity;
    }
  | {
      readonly state: 'conflict' | 'stale';
      readonly lock: ApmApplyLockIdentity;
      readonly reason: string;
    };

export interface ApmApplyStepObservation {
  readonly state: 'pending' | 'satisfied' | 'conflict' | 'unknown';
  readonly evidence: readonly string[];
  readonly reason?: string;
}

export interface ApmApplyStepExecutionResult {
  readonly state: 'completed' | 'failed' | 'unknown';
  readonly evidence: readonly string[];
  readonly diagnostics: readonly ApmStatusDiagnostic[];
  readonly failure?: ApmApplyFailure;
}

export type ApmApplyBlockerCode =
  | 'apply.plan-incomplete'
  | 'apply.plan-stale'
  | 'apply.executor-incompatible'
  | 'apply.lock-conflict'
  | 'apply.operation-not-found'
  | 'apply.journal-invalid'
  | 'apply.permission-required'
  | 'apply.prerequisite-incomplete'
  | 'apply.precondition-changed'
  | 'apply.output-mismatch'
  | 'apply.step-failed'
  | 'apply.recovery-required'
  | 'apply.cancelled';

export interface ApmApplyBlocker {
  readonly code: ApmApplyBlockerCode;
  readonly scope: {
    readonly kind: 'project' | 'operation' | 'step' | 'host';
    readonly id?: string;
    readonly path?: string;
  };
  readonly evidence: readonly string[];
  readonly reason: string;
  readonly nextAction?: string;
}

export interface ApmApplyClockPort {
  readonly nowIso: () => string;
}

export interface ApmApplyOperationIdPort {
  readonly createOperationId: () => string;
}

export interface ApmApplyLockPort {
  readonly acquireAsync: (input: {
    readonly rootPath: string;
    readonly operationId: string;
    readonly planId: string;
    readonly resume: boolean;
  }) => Promise<ApmApplyLockAcquireResult>;
  readonly recoverStaleAsync: (input: {
    readonly rootPath: string;
    readonly operationId: string;
    readonly planId: string;
    readonly stale: ApmApplyLockIdentity;
  }) => Promise<ApmApplyLockAcquireResult>;
  readonly releaseAsync: (rootPath: string, operationId: string) => Promise<void>;
}

export interface ApmApplyJournalPort {
  readonly createAsync: (journal: ApmApplyJournal) => Promise<void>;
  readonly readAsync: (rootPath: string, operationId: string) => Promise<ApmApplyJournal | undefined>;
  readonly writeAsync: (journal: ApmApplyJournal) => Promise<void>;
}

export interface ApmApplyStatusPort {
  readonly inspectStatusAsync: (rootPath: string) => Promise<ApmStatusResult>;
}

export interface ApmApplyPlanValidationPort {
  readonly validateAsync: (input: {
    readonly plan: ApmPlanResult;
    readonly status: ApmStatusResult;
    readonly executor: ApmPlanExecutorIdentity;
  }) => Promise<readonly ApmPlanBlocker[]>;
}

export interface ApmApplyExecutorIdentityPort {
  readonly current: () => ApmPlanExecutorIdentity;
}

export interface ApmApplyStepPort {
  readonly observeAsync: (input: {
    readonly journal: ApmApplyJournal;
    readonly step: ApmPlanStep;
  }) => Promise<ApmApplyStepObservation>;
  readonly executeAsync: (input: {
    readonly journal: ApmApplyJournal;
    readonly step: ApmPlanStep;
  }) => Promise<ApmApplyStepExecutionResult>;
  readonly rollbackAsync: (input: {
    readonly journal: ApmApplyJournal;
    readonly step: ApmPlanStep;
  }) => Promise<ApmApplyStepExecutionResult>;
}

export interface ApmApplyProgressEvent {
  readonly operationId: string;
  readonly stepId?: string;
  readonly state: ApmApplyJournalStatus | ApmApplyStepState;
  readonly message: string;
}

export interface ApmApplyProgressPort {
  readonly publishAsync: (event: ApmApplyProgressEvent) => Promise<void>;
}

export interface ApmApplyCancellationPort {
  readonly isCancellationRequestedAsync: (operationId: string) => Promise<boolean>;
}

export interface ApmApplyPorts {
  readonly clock: ApmApplyClockPort;
  readonly operationId: ApmApplyOperationIdPort;
  readonly lock: ApmApplyLockPort;
  readonly journal: ApmApplyJournalPort;
  readonly status: ApmApplyStatusPort;
  readonly planValidation: ApmApplyPlanValidationPort;
  readonly executor: ApmApplyExecutorIdentityPort;
  readonly step: ApmApplyStepPort;
  readonly progress?: ApmApplyProgressPort;
  readonly cancellation?: ApmApplyCancellationPort;
}

export type ApmApplyResultStatus =
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'recovery-required';

export interface ApmApplyResult {
  readonly schemaVersion: 1;
  readonly operation: 'apply';
  readonly operationId: string;
  readonly planId?: string;
  readonly rootPath: string;
  readonly status: ApmApplyResultStatus;
  readonly complete: boolean;
  readonly journal?: ApmApplyJournal;
  readonly blockers: readonly ApmApplyBlocker[];
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

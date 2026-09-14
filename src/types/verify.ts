import type { ApmApplyJournal } from './apply.js';
import type { ApmPlanResult, ApmPlanStep } from './plan.js';
import type { ApmStatusDiagnostic, ApmStatusFinding, ApmStatusResult } from './status.js';
import type { ApmReleaseEffect } from './update-protocol.js';

export interface ApmVerifyInput {
  readonly rootPath: string;
  readonly operationId: string;
}

export type ApmVerifyCheckStatus = 'passed' | 'failed' | 'unknown' | 'skipped';

export type ApmVerifyCheckKind =
  | 'operation'
  | 'dependency-state'
  | 'migration'
  | 'projection'
  | 'validation';

export interface ApmVerifyCheckResult {
  readonly id: string;
  readonly kind: ApmVerifyCheckKind;
  readonly status: ApmVerifyCheckStatus;
  readonly evidence: readonly string[];
  readonly reason?: string;
  readonly nextAction?: string;
}

export interface ApmVerifyJournalPort {
  readonly readAsync: (
    rootPath: string,
    operationId: string,
  ) => Promise<ApmApplyJournal | undefined>;
}

export interface ApmVerifyStatusPort {
  readonly inspectStatusAsync: (rootPath: string) => Promise<ApmStatusResult>;
}

export interface ApmVerifyStepPort {
  readonly verifyAsync: (input: {
    readonly plan: ApmPlanResult;
    readonly step: ApmPlanStep;
    readonly status: ApmStatusResult;
  }) => Promise<readonly ApmVerifyCheckResult[]>;
}

export interface ApmVerifyPorts {
  readonly journal: ApmVerifyJournalPort;
  readonly status: ApmVerifyStatusPort;
  readonly step: ApmVerifyStepPort;
}

export interface ApmVerifyResult {
  readonly schemaVersion: 1;
  readonly operation: 'verify';
  readonly operationId: string;
  readonly planId?: string;
  readonly rootPath: string;
  readonly verified: boolean;
  readonly checks: readonly ApmVerifyCheckResult[];
  readonly findings: readonly ApmStatusFinding[];
  readonly followUp: readonly ApmReleaseEffect[];
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

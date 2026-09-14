import type {
  ApmApplyBlocker,
  ApmApplyJournal,
  ApmApplyResultStatus,
} from './apply.js';
import type { ApmStatusDiagnostic } from './status.js';

export interface ApmApplyRunOutcome {
  readonly journal: ApmApplyJournal;
  readonly status: ApmApplyResultStatus;
  readonly blockers: readonly ApmApplyBlocker[];
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

import type { ApmApplyJournal, ApmApplyStepExecutionResult } from '../../../../types/apply.js';
import type { ApmPlanStep } from '../../../../types/plan.js';
import { restoreApplyStepSnapshotAsync } from './restoreApplyStepSnapshotAsync.js';

/*** Restore exactly the reviewed file snapshot for one reversible local step. */
export async function rollbackNodeFileStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
): Promise<ApmApplyStepExecutionResult> {
  try {
    const restored = await restoreApplyStepSnapshotAsync(journal, step);
    return { state: 'completed', evidence: restored, diagnostics: [] };
  } catch (error) {
    return {
      state: 'unknown',
      evidence: [error instanceof Error ? error.message : 'unknown snapshot restore failure'],
      diagnostics: [],
      failure: {
        code: 'apply.rollback-unknown',
        reason: 'APM could not prove restoration of the reviewed local file snapshot.',
        evidence: [step.id],
        nextAction: 'Inspect the durable operation snapshot and recover the reviewed files explicitly.',
      },
    };
  }
}

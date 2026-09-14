import {
  removeFileWithinRoot,
  writeFileWithinRoot,
} from '@ankhorage/utility/node/fs';
import { resolvePathWithinRoot } from '@ankhorage/utility/node/path';

import type { ApmApplyJournal, ApmApplyStepExecutionResult } from '../../../../types/apply.js';
import type { ApmPlanDigestPort, ApmPlanFileChange, ApmPlanStep } from '../../../../types/plan.js';
import { reviewedFileChanges } from '../../domain/reviewedFileChanges.js';
import { ensureApplyStepSnapshotAsync } from './ensureApplyStepSnapshotAsync.js';
import { observeNodeFileStepAsync } from './observeNodeFileStepAsync.js';

/*** Apply only exact reviewed file contents after confirming the project still matches a safe before/after state. */
export async function executeNodeFileStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  digest: ApmPlanDigestPort,
): Promise<ApmApplyStepExecutionResult> {
  const changes = reviewedFileChanges(journal.plan.files, step);
  if (changes === undefined) return invalidFileStep(step.id);
  const observation = await observeNodeFileStepAsync(journal.rootPath, journal.plan.files, step, digest);
  if (observation.state === 'satisfied') {
    return { state: 'completed', evidence: observation.evidence, diagnostics: [] };
  }
  if (observation.state !== 'pending') {
    return {
      state: 'failed',
      evidence: observation.evidence,
      diagnostics: [],
      failure: {
        code: 'apply.precondition-changed',
        reason: observation.reason ?? 'Reviewed file preconditions changed before execution.',
        evidence: observation.evidence,
      },
    };
  }
  await ensureApplyStepSnapshotAsync(journal, step);
  const invalid = changes.find(
    (change) => change.kind !== 'delete' && change.afterContent === undefined,
  );
  if (invalid !== undefined) return missingReviewedContent(invalid);
  await Promise.all(changes.map((change) => applyChangeAsync(journal.rootPath, change)));
  return { state: 'completed', evidence: changes.map(({ path }) => path), diagnostics: [] };
}

/*** Apply one exact reviewed create/update/delete without touching paths outside the project root. */
async function applyChangeAsync(rootPath: string, change: ApmPlanFileChange): Promise<void> {
  const filePath = resolvePathWithinRoot(rootPath, change.path);
  if (change.kind === 'delete') {
    await removeFileWithinRoot({ rootPath, filePath, pruneEmptyParents: true });
    return;
  }
  if (change.afterContent === undefined) {
    throw new Error(`Reviewed file content is unavailable for '${change.path}'.`);
  }
  await writeFileWithinRoot({
    rootPath,
    filePath,
    body: new TextEncoder().encode(change.afterContent),
    exclusive: false,
  });
}

/*** Reject a file step whose paths no longer resolve to frozen plan file changes. */
function invalidFileStep(stepId: string): ApmApplyStepExecutionResult {
  return {
    state: 'failed',
    evidence: [stepId],
    diagnostics: [],
    failure: {
      code: 'apply.journal-invalid',
      reason: 'Reviewed file step cannot be resolved against the frozen plan.',
      evidence: [stepId],
    },
  };
}

/*** Reject a non-delete change that cannot materialize its reviewed target bytes. */
function missingReviewedContent(change: ApmPlanFileChange): ApmApplyStepExecutionResult {
  return {
    state: 'failed',
    evidence: [change.path],
    diagnostics: [],
    failure: {
      code: 'apply.reviewed-content-missing',
      reason: 'Reviewed plan is missing exact target content required for a file write.',
      evidence: [change.path],
      nextAction: 'Create a new complete plan that freezes the exact target file content.',
    },
  };
}

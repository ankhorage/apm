import type { ApmApplyStepObservation } from '../../../../types/apply.js';
import type { ApmPlanDigestPort, ApmPlanFileChange, ApmPlanStep } from '../../../../types/plan.js';
import { reviewedFileChanges } from '../../domain/reviewedFileChanges.js';
import { readPlanFileStateAsync } from './readPlanFileStateAsync.js';

/*** Observe exact reviewed file pre/postconditions without mutating project state. */
export async function observeNodeFileStepAsync(
  rootPath: string,
  files: readonly ApmPlanFileChange[],
  step: ApmPlanStep,
  digest: ApmPlanDigestPort,
): Promise<ApmApplyStepObservation> {
  const changes = reviewedFileChanges(files, step);
  if (changes === undefined) {
    return {
      state: 'conflict',
      evidence: [step.id],
      reason: 'Reviewed file step references a path absent from the frozen plan file changes.',
    };
  }
  const states = await Promise.all(
    changes.map(async (change) => classifyChangeAsync(rootPath, change, digest)),
  );
  if (states.every((state) => state === 'after')) {
    return { state: 'satisfied', evidence: changes.map(({ path }) => path) };
  }
  if (states.every((state) => state === 'before' || state === 'after')) {
    return { state: 'pending', evidence: changes.map(({ path }) => path) };
  }
  return {
    state: states.some((state) => state === 'conflict') ? 'conflict' : 'unknown',
    evidence: changes.map(({ path }, index) => `${path}:${states[index] ?? 'unknown'}`),
    reason: 'Current file content does not match the reviewed before/after state for this step.',
  };
}

type ChangeState = 'before' | 'after' | 'conflict' | 'unknown';

/*** Classify one file against its exact frozen before/after digest contract. */
async function classifyChangeAsync(
  rootPath: string,
  change: ApmPlanFileChange,
  digest: ApmPlanDigestPort,
): Promise<ChangeState> {
  const current = await readPlanFileStateAsync(rootPath, change.path, digest);
  if (matchesAfter(change, current.exists, current.digest)) return 'after';
  if (matchesBefore(change, current.exists, current.digest)) return 'before';
  return expectedDigestsKnown(change) ? 'conflict' : 'unknown';
}

/*** Test the current file state against the reviewed postcondition. */
function matchesAfter(change: ApmPlanFileChange, exists: boolean, digest: string | undefined): boolean {
  if (change.kind === 'delete') return !exists;
  return exists && change.afterDigest !== undefined && digest === change.afterDigest;
}

/*** Test the current file state against the reviewed precondition. */
function matchesBefore(change: ApmPlanFileChange, exists: boolean, digest: string | undefined): boolean {
  if (change.kind === 'create') return !exists;
  return exists && change.beforeDigest !== undefined && digest === change.beforeDigest;
}

/*** Require the digests needed to distinguish a foreign file state from incomplete evidence. */
function expectedDigestsKnown(change: ApmPlanFileChange): boolean {
  const beforeKnown = change.kind === 'create' || change.beforeDigest !== undefined;
  const afterKnown = change.kind === 'delete' || change.afterDigest !== undefined;
  return beforeKnown && afterKnown;
}

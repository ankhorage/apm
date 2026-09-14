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
  const observations = await Promise.all(
    changes.map(async (change): Promise<FileChangeObservation> => ({
      path: change.path,
      state: await classifyChangeAsync(rootPath, change, digest),
    })),
  );
  if (observations.every(({ state }) => state === 'after')) {
    return { state: 'satisfied', evidence: observations.map(({ path }) => path) };
  }
  if (observations.every(({ state }) => state === 'before' || state === 'after')) {
    return { state: 'pending', evidence: observations.map(({ path }) => path) };
  }
  return {
    state: observations.some(({ state }) => state === 'conflict') ? 'conflict' : 'unknown',
    evidence: observations.map(({ path, state }) => `${path}:${state}`),
    reason: 'Current file content does not match the reviewed before/after state for this step.',
  };
}

type ChangeState = 'before' | 'after' | 'conflict' | 'unknown';

interface FileChangeObservation {
  readonly path: string;
  readonly state: ChangeState;
}

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
function matchesAfter(
  change: ApmPlanFileChange,
  exists: boolean,
  digest: string | undefined,
): boolean {
  if (change.kind === 'delete') return !exists;
  return exists && change.afterDigest !== undefined && digest === change.afterDigest;
}

/*** Test the current file state against the reviewed precondition. */
function matchesBefore(
  change: ApmPlanFileChange,
  exists: boolean,
  digest: string | undefined,
): boolean {
  if (change.kind === 'create') return !exists;
  return exists && change.beforeDigest !== undefined && digest === change.beforeDigest;
}

/*** Require the digests needed to distinguish a foreign file state from incomplete evidence. */
function expectedDigestsKnown(change: ApmPlanFileChange): boolean {
  const beforeKnown = change.kind === 'create' || change.beforeDigest !== undefined;
  const afterKnown = change.kind === 'delete' || change.afterDigest !== undefined;
  return beforeKnown && afterKnown;
}

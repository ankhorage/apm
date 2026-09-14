import type { ApmPlanFileChange, ApmPlanStep } from '../../../types/plan.js';

/*** Resolve the exact plan file changes owned by one reviewed dependency-files step. */
export function reviewedFileChanges(
  files: readonly ApmPlanFileChange[],
  step: ApmPlanStep,
): readonly ApmPlanFileChange[] | undefined {
  if (step.execution.kind !== 'dependency-files') return undefined;
  const byPath = new Map(files.map((change) => [change.path, change]));
  const resolved = step.execution.filePaths.map((path) => byPath.get(path));
  return resolved.every(isDefined) ? resolved : undefined;
}

/*** Narrow optional reviewed file changes after deterministic path lookup. */
function isDefined(value: ApmPlanFileChange | undefined): value is ApmPlanFileChange {
  return value !== undefined;
}

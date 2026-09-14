import type { ApmPlanStep } from '../../../types/plan.js';

/*** Return the exact project-relative file paths a reviewed local step may mutate. */
export function reviewedStepFilePaths(step: ApmPlanStep): readonly string[] {
  const paths =
    step.execution.kind === 'dependency-files'
      ? step.execution.filePaths
      : step.execution.kind === 'migration' || step.execution.kind === 'projection'
        ? step.execution.plan.mutations.map(({ path }) => path)
        : [];
  return [...new Set(paths)].sort(compareText);
}

/*** Compare project-relative paths without locale-dependent ordering. */
function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

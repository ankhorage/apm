import type { ApmPlanBlocker, ApmPlanStep } from '../../../types/plan.js';

/*** Topologically order plan steps with stable lexical tie-breaking and explicit cycle blockers. */
export function orderPlanSteps(steps: readonly ApmPlanStep[]): {
  readonly steps: readonly ApmPlanStep[];
  readonly blockers: readonly ApmPlanBlocker[];
} {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const missing = steps.flatMap((step) =>
    step.prerequisites.filter((id) => !byId.has(id)).map((id) => missingPrerequisite(step, id)),
  );
  if (missing.length > 0) return { steps: [], blockers: missing };
  const ordered = topologicalOrder(byId);
  return ordered.length === steps.length
    ? { steps: ordered, blockers: [] }
    : { steps: [], blockers: [cycleBlocker(steps, ordered)] };
}

/*** Repeatedly select every ready node in stable ID order without mutating step declarations. */
function topologicalOrder(byId: ReadonlyMap<string, ApmPlanStep>): readonly ApmPlanStep[] {
  return traverse(byId, new Set(), []);
}

/*** Continue topological traversal until no new ready step remains. */
function traverse(
  byId: ReadonlyMap<string, ApmPlanStep>,
  completed: ReadonlySet<string>,
  ordered: readonly ApmPlanStep[],
): readonly ApmPlanStep[] {
  const ready = [...byId.values()]
    .filter(
      (step) =>
        !completed.has(step.id) &&
        step.prerequisites.every((prerequisite) => completed.has(prerequisite)),
    )
    .sort((left, right) => compareText(left.id, right.id));
  if (ready.length === 0) return ordered;
  const nextCompleted = new Set([...completed, ...ready.map(({ id }) => id)]);
  return traverse(byId, nextCompleted, [...ordered, ...ready]);
}

/*** Report a step referencing an absent prerequisite instead of silently dropping the edge. */
function missingPrerequisite(step: ApmPlanStep, prerequisite: string): ApmPlanBlocker {
  return {
    code: 'plan.step-cycle',
    scope: { kind: 'project', id: step.id },
    evidence: [step.id, prerequisite],
    reason: 'Plan step references a prerequisite that is not present in the plan.',
  };
}

/*** Report the unresolved subgraph when deterministic ordering detects a cycle. */
function cycleBlocker(
  steps: readonly ApmPlanStep[],
  ordered: readonly ApmPlanStep[],
): ApmPlanBlocker {
  const completed = new Set(ordered.map(({ id }) => id));
  return {
    code: 'plan.step-cycle',
    scope: { kind: 'project' },
    evidence: steps
      .filter(({ id }) => !completed.has(id))
      .map(({ id }) => id)
      .sort(compareText),
    reason: 'Plan steps contain a prerequisite cycle and cannot be executed in a stable order.',
  };
}

/*** Compare stable IDs without locale-dependent ordering. */
function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

import type {
  ApmPlanResolutionResult,
  ApmPlanStep,
  ApmPlanProtocolResult,
} from '../../../types/plan.js';
import type { ApmReleaseEffect } from '../../../types/update-protocol.js';

/*** Build the generic dependency/install/validation/follow-up step graph around protocol-owned steps. */
export function buildPlanSteps(
  resolutions: readonly ApmPlanResolutionResult[],
  protocol: ApmPlanProtocolResult,
  effects: readonly ApmReleaseEffect[],
): readonly ApmPlanStep[] {
  const dependencySteps = resolutions.flatMap(resolutionSteps);
  const mutationSteps = [...dependencySteps, ...protocol.steps];
  if (mutationSteps.length === 0 && effects.length === 0) return [];
  const validation = validationStep(mutationSteps);
  return [
    ...mutationSteps,
    validation,
    ...effects.map((effect, index) => followUpStep(effect, index, validation.id)),
  ];
}

/*** Build staged file and install steps for one native package-manager result. */
function resolutionSteps(resolution: ApmPlanResolutionResult): readonly ApmPlanStep[] {
  const fileStepId = `dependency-files:${resolution.installRootId}`;
  const installStepId = `install:${resolution.installRootId}`;
  const fileStep =
    resolution.files.length === 0
      ? []
      : [
          {
            id: fileStepId,
            kind: 'dependency-files' as const,
            prerequisites: [],
            installRootId: resolution.installRootId,
            reason: 'Apply reviewed manifest and lockfile changes produced by native resolution.',
            evidence: resolution.files.map(({ path }) => path),
          },
        ];
  return [
    ...fileStep,
    {
      id: installStepId,
      kind: 'install',
      prerequisites: fileStep.length === 0 ? [] : [fileStepId],
      installRootId: resolution.installRootId,
      reason: 'Materialize the already resolved dependency graph without selecting new versions.',
      evidence: resolution.packages.map(({ id }) => id),
    },
  ];
}

/*** Require one final project validation after every local mutation-capable step. */
function validationStep(steps: readonly ApmPlanStep[]): ApmPlanStep {
  return {
    id: 'validation:project',
    kind: 'validation',
    prerequisites: terminalStepIds(steps),
    reason: 'Verify dependency graph, migrations and projections after reviewed local changes.',
    evidence: [],
  };
}

/*** Return step IDs that are not prerequisites of another mutation step. */
function terminalStepIds(steps: readonly ApmPlanStep[]): readonly string[] {
  const prerequisiteIds = new Set(steps.flatMap(({ prerequisites }) => prerequisites));
  return steps
    .filter(({ id }) => !prerequisiteIds.has(id))
    .map(({ id }) => id)
    .sort(compareText);
}

/*** Convert shipment implications to explicit post-validation follow-up steps. */
function followUpStep(
  effect: ApmReleaseEffect,
  index: number,
  validationId: string,
): ApmPlanStep {
  const effectKind = effect.kind;
  const reason = effect.reason;
  const evidence = effect.evidence;
  return {
    id: `follow-up:${effectKind}:${index}`,
    kind: 'follow-up',
    prerequisites: [validationId],
    reason,
    evidence,
  };
}

/*** Compare stable step IDs without locale-dependent ordering. */
function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

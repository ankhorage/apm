import type {
  ApmPlanBlocker,
  ApmPlanInput,
  ApmPlanInputFingerprint,
  ApmPlanPolicy,
  ApmPlanProtocolResult,
  ApmPlanResolutionResult,
  ApmPlanResult,
  ApmPlanStep,
} from '../../../types/plan.js';
import type { ApmReleaseEffect } from '../../../types/update-protocol.js';

/*** Build the immutable plan payload and expose executable diffs only when every planning gate passed. */
export function buildPlanCore(
  input: BuildPlanCoreInput,
): Omit<ApmPlanResult, 'schemaVersion' | 'operation' | 'id'> {
  const executable =
    input.planInput.status.complete &&
    input.resolutions.every(({ complete }) => complete) &&
    input.protocol.complete &&
    input.blockers.length === 0;
  return {
    rootPath: input.planInput.status.rootPath,
    complete: executable,
    policy: input.policy,
    executor: input.planInput.executor,
    inputFingerprint: input.inputFingerprint,
    targets: input.targets,
    files: executable ? planFiles(input) : [],
    packages: executable ? planPackages(input.resolutions) : [],
    artifacts: executable ? planArtifacts(input) : [],
    steps: executable ? input.steps : [],
    effects: input.effects,
    findings: [...input.planInput.status.findings, ...input.protocol.findings],
    blockers: input.blockers,
    diagnostics: [
      ...input.planInput.status.diagnostics,
      ...input.resolutions.flatMap(({ diagnostics }) => diagnostics),
      ...input.protocol.diagnostics,
    ],
  };
}

interface BuildPlanCoreInput {
  readonly planInput: ApmPlanInput;
  readonly policy: ApmPlanPolicy;
  readonly inputFingerprint: ApmPlanInputFingerprint;
  readonly targets: ApmPlanResult['targets'];
  readonly resolutions: readonly ApmPlanResolutionResult[];
  readonly protocol: ApmPlanProtocolResult;
  readonly effects: readonly ApmReleaseEffect[];
  readonly steps: readonly ApmPlanStep[];
  readonly blockers: readonly ApmPlanBlocker[];
}

/*** Merge native and owner-reviewed file diffs in stable path order. */
function planFiles(input: BuildPlanCoreInput): ApmPlanResult['files'] {
  return [...input.resolutions.flatMap(({ files }) => files), ...input.protocol.files].sort(
    (left, right) => compareText(left.path, right.path),
  );
}

/*** Flatten the exact resolved package graph only after all plan gates pass. */
function planPackages(resolutions: readonly ApmPlanResolutionResult[]): ApmPlanResult['packages'] {
  return resolutions
    .flatMap(({ packages }) => packages)
    .sort((left, right) => compareText(left.id, right.id));
}

/*** Merge immutable native and owner artifact identities in stable ID order. */
function planArtifacts(input: BuildPlanCoreInput): ApmPlanResult['artifacts'] {
  return [
    ...input.resolutions.flatMap(({ artifacts }) => artifacts),
    ...input.protocol.artifacts,
  ].sort((left, right) => compareText(left.id, right.id));
}

/*** Compare stable serialized identifiers without locale-dependent ordering. */
function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

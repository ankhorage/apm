import type {
  ApmPlanBlocker,
  ApmPlanInput,
  ApmPlanInputFingerprint,
  ApmPlanPorts,
  ApmPlanProtocolResult,
  ApmPlanResolutionRequest,
  ApmPlanResolutionResult,
  ApmPlanResult,
} from '../../../types/plan.js';
import type { ApmReleaseEffect } from '../../../types/update-protocol.js';
import { buildPlanCore } from '../domain/buildPlanCore.js';
import { buildPlanIdSource } from '../domain/buildPlanIdSource.js';
import { buildPlanResolutionRequests } from '../domain/buildPlanResolutionRequests.js';
import { buildPlanSteps } from '../domain/buildPlanSteps.js';
import { createPlanInputFingerprintAsync } from '../domain/createPlanInputFingerprintAsync.js';
import { mergePlanSelections } from '../domain/mergePlanSelections.js';
import { normalizePlanPolicy } from '../domain/normalizePlanPolicy.js';
import { orderPlanSteps } from '../domain/orderPlanSteps.js';
import { selectDependencyTargets } from '../domain/selectDependencyTargets.js';

/*** Build one serializable reproducible update plan without mutating the inspected project. */
export async function planAsync(input: ApmPlanInput, ports: ApmPlanPorts): Promise<ApmPlanResult> {
  const policy = normalizePlanPolicy(input.policy);
  const inputFingerprint = await createPlanInputFingerprintAsync(
    input.status,
    policy,
    ports.digest,
  );
  const evidence = await buildPlanEvidenceAsync(input, policy, inputFingerprint, ports);
  const planCore = buildPlanCore({
    planInput: input,
    policy,
    inputFingerprint,
    ...evidence,
  });
  const id = await ports.digest.digestAsync(buildPlanIdSource(planCore));
  return { schemaVersion: 2, operation: 'plan', id, ...planCore };
}

interface PlanEvidence {
  readonly targets: ApmPlanResult['targets'];
  readonly resolutions: readonly ApmPlanResolutionResult[];
  readonly protocol: ApmPlanProtocolResult;
  readonly effects: readonly ApmReleaseEffect[];
  readonly steps: ApmPlanResult['steps'];
  readonly blockers: readonly ApmPlanBlocker[];
}

interface DependencyIterationEvidence {
  readonly targets: ApmPlanResult['targets'];
  readonly resolutions: readonly ApmPlanResolutionResult[];
  readonly blockers: readonly ApmPlanBlocker[];
}

/*** Resolve dependency and owner requirements repeatedly until the reviewed target graph converges. */
async function buildPlanEvidenceAsync(
  input: ApmPlanInput,
  policy: ReturnType<typeof normalizePlanPolicy>,
  inputFingerprint: ApmPlanInputFingerprint,
  ports: ApmPlanPorts,
): Promise<PlanEvidence> {
  return runPlanIterationAsync(input, policy, policy, inputFingerprint, ports, 1);
}

/*** Run one native/protocol planning iteration and either converge, block, or request another pass. */
async function runPlanIterationAsync(
  input: ApmPlanInput,
  requestedPolicy: ReturnType<typeof normalizePlanPolicy>,
  workingPolicy: ReturnType<typeof normalizePlanPolicy>,
  inputFingerprint: ApmPlanInputFingerprint,
  ports: ApmPlanPorts,
  iteration: number,
): Promise<PlanEvidence> {
  const dependency = await resolveDependencyIterationAsync(input, workingPolicy, ports);
  if (dependency.blockers.length > 0) {
    return blockedEvidence(dependency, EMPTY_PROTOCOL_RESULT, dependency.blockers);
  }
  const protocol = await planProtocolAsync(
    input,
    workingPolicy,
    inputFingerprint,
    dependency.targets,
    dependency.resolutions,
    ports,
  );
  if (!protocol.complete || protocol.blockers.length > 0) {
    return blockedEvidence(dependency, protocol, protocol.blockers);
  }
  const merged = mergePlanSelections(workingPolicy, protocol.requiredSelections);
  if (merged.blockers.length > 0) return blockedEvidence(dependency, protocol, merged.blockers);
  if (!merged.changed) return finalizedEvidence(dependency, protocol);
  if (iteration >= requestedPolicy.maxGeneratorIterations) {
    return blockedEvidence(dependency, protocol, [
      nonconvergentGeneratorBlocker(iteration, protocol),
    ]);
  }
  return runPlanIterationAsync(
    input,
    requestedPolicy,
    merged.policy,
    inputFingerprint,
    ports,
    iteration + 1,
  );
}

/*** Select targets and run native package-manager resolution for one effective policy iteration. */
async function resolveDependencyIterationAsync(
  input: ApmPlanInput,
  policy: ReturnType<typeof normalizePlanPolicy>,
  ports: ApmPlanPorts,
): Promise<DependencyIterationEvidence> {
  const statusBlockers = input.status.complete ? [] : [incompleteStatusBlocker(input)];
  const selected = selectDependencyTargets(input.status, policy);
  const requests = buildPlanResolutionRequests(input.status, policy, selected.targets);
  const preliminaryBlockers = [...statusBlockers, ...selected.blockers, ...requests.blockers];
  const resolutions =
    preliminaryBlockers.length === 0 ? await resolveAllAsync(requests.requests, ports) : [];
  return {
    targets: selected.targets,
    resolutions,
    blockers: [...preliminaryBlockers, ...resolutions.flatMap(({ blockers }) => blockers)],
  };
}

/*** Finalize shipment and DAG evidence after dependency/owner selections have converged. */
function finalizedEvidence(
  dependency: DependencyIterationEvidence,
  protocol: ApmPlanProtocolResult,
): PlanEvidence {
  const effects = planEffects(dependency.targets.length > 0, protocol.effects);
  const ordered = orderPlanSteps(buildPlanSteps(dependency.resolutions, protocol, effects));
  return {
    targets: dependency.targets,
    resolutions: dependency.resolutions,
    protocol,
    effects,
    steps: ordered.steps,
    blockers: ordered.blockers,
  };
}

/*** Preserve diagnostics/targets while withholding executable intermediate changes from blocked iterations. */
function blockedEvidence(
  dependency: DependencyIterationEvidence,
  protocol: ApmPlanProtocolResult,
  blockers: readonly ApmPlanBlocker[],
): PlanEvidence {
  return {
    targets: dependency.targets,
    resolutions: dependency.resolutions,
    protocol,
    effects: [],
    steps: [],
    blockers,
  };
}

/*** Resolve install roots independently so one failed native solver remains explicit plan evidence. */
async function resolveAllAsync(
  requests: readonly ApmPlanResolutionRequest[],
  ports: ApmPlanPorts,
): Promise<readonly ApmPlanResolutionResult[]> {
  return Promise.all(requests.map((request) => resolveOneAsync(request, ports)));
}

/*** Translate unexpected resolver failures into stable incomplete resolution results. */
async function resolveOneAsync(
  request: ApmPlanResolutionRequest,
  ports: ApmPlanPorts,
): Promise<ApmPlanResolutionResult> {
  try {
    return await ports.resolution.resolveAsync(request);
  } catch (error) {
    return {
      installRootId: request.installRootId,
      installRootPath: request.installRootPath,
      complete: false,
      manager: request.manager,
      ...(request.managerVersion === undefined ? {} : { managerVersion: request.managerVersion }),
      ...(request.linker === undefined ? {} : { linker: request.linker }),
      files: [],
      packages: [],
      artifacts: [],
      effects: {
        projectWrites: false,
        lifecycleScripts: false,
        network: 'allowed',
        cache: 'manager-default',
      },
      blockers: [resolverFailureBlocker(request, error)],
      diagnostics: [],
    };
  }
}

/*** Compose package-owned migration/projection planning when a protocol adapter is available. */
async function planProtocolAsync(
  input: ApmPlanInput,
  policy: ReturnType<typeof normalizePlanPolicy>,
  inputFingerprint: ApmPlanInputFingerprint,
  targets: ApmPlanResult['targets'],
  resolutions: readonly ApmPlanResolutionResult[],
  ports: ApmPlanPorts,
): Promise<ApmPlanProtocolResult> {
  if (ports.protocol !== undefined) {
    return ports.protocol.planProtocolAsync({
      status: input.status,
      policy,
      inputFingerprint,
      targets,
      resolutions,
    });
  }
  return protocolRequired(input, policy)
    ? { ...EMPTY_PROTOCOL_RESULT, complete: false, blockers: [protocolUnavailableBlocker()] }
    : EMPTY_PROTOCOL_RESULT;
}

const EMPTY_PROTOCOL_RESULT: ApmPlanProtocolResult = {
  complete: true,
  requiredSelections: [],
  files: [],
  artifacts: [],
  steps: [],
  effects: [],
  findings: [],
  blockers: [],
  diagnostics: [],
};

/*** Require protocol ownership only for currently observed pending/stale owner work. */
function protocolRequired(
  input: ApmPlanInput,
  policy: ReturnType<typeof normalizePlanPolicy>,
): boolean {
  return input.status.extensions.observations.some(
    ({ migration, projection }) =>
      migration === 'pending' || (policy.repairProjections && projection === 'stale'),
  );
}

/*** Preserve protocol shipment evidence and make unproven OTA eligibility explicit for package changes. */
function planEffects(
  hasDependencyTargets: boolean,
  effects: readonly ApmReleaseEffect[],
): readonly ApmReleaseEffect[] {
  const hasOtaEvidence = effects.some(({ kind }) => kind === 'ota-eligibility');
  return hasDependencyTargets && !hasOtaEvidence
    ? [
        ...effects,
        {
          kind: 'ota-eligibility',
          eligibility: 'unknown',
          evidence: [],
          reason: 'Dependency graph changes have no protocol evidence proving OTA eligibility.',
        },
      ]
    : effects;
}

/*** Explain why incomplete status evidence cannot produce a complete executable plan. */
function incompleteStatusBlocker(input: ApmPlanInput): ApmPlanBlocker {
  return {
    code: 'plan.status-incomplete',
    scope: { kind: 'project', path: input.status.rootPath },
    evidence: input.status.diagnostics.map(({ code }) => code),
    reason:
      'Planning input is incomplete; missing evidence cannot be converted into a safe executable plan.',
    nextAction: 'Resolve status diagnostics and refresh evidence before applying an update plan.',
  };
}

/*** Explain an unexpected native resolver failure without leaking transport-specific exceptions into the plan schema. */
function resolverFailureBlocker(request: ApmPlanResolutionRequest, error: unknown): ApmPlanBlocker {
  return {
    code: 'plan.resolution-failed',
    scope: { kind: 'install-root', id: request.installRootId, path: request.installRootPath },
    evidence: [error instanceof Error ? error.message : 'unknown resolver failure'],
    reason: 'Native package-manager resolution failed before a complete target graph was produced.',
  };
}

/*** Block owner policies that still demand another dependency graph after the configured iteration bound. */
function nonconvergentGeneratorBlocker(
  iteration: number,
  protocol: ApmPlanProtocolResult,
): ApmPlanBlocker {
  return {
    code: 'plan.generator-nonconvergent',
    scope: { kind: 'project' },
    evidence: [
      `iteration:${iteration}`,
      ...protocol.requiredSelections.map(({ selector }) => selector.name),
    ],
    reason: 'Package-owned dependency requirements did not converge within the planning bound.',
    nextAction:
      'Review owner package policy or raise the explicit iteration bound before re-planning.',
  };
}

/*** Explain missing package-owned planning where current status already proves pending owner work. */
function protocolUnavailableBlocker(): ApmPlanBlocker {
  return {
    code: 'plan.protocol-unavailable',
    scope: { kind: 'project' },
    evidence: [],
    reason:
      'Migration or projection work is pending but no package-owned protocol planner is available.',
    nextAction: 'Load or install the required trusted owner extension before applying updates.',
  };
}

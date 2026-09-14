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
import { buildPlanInputFingerprintSource } from '../domain/buildPlanInputFingerprintSource.js';
import { buildPlanResolutionRequests } from '../domain/buildPlanResolutionRequests.js';
import { buildPlanSteps } from '../domain/buildPlanSteps.js';
import { normalizePlanPolicy } from '../domain/normalizePlanPolicy.js';
import { orderPlanSteps } from '../domain/orderPlanSteps.js';
import { selectDependencyTargets } from '../domain/selectDependencyTargets.js';

/*** Build one serializable reproducible update plan without mutating the inspected project. */
export async function planAsync(input: ApmPlanInput, ports: ApmPlanPorts): Promise<ApmPlanResult> {
  const policy = normalizePlanPolicy(input.policy);
  const inputFingerprint = await fingerprintAsync(input, policy, ports);
  const statusBlockers = input.status.complete ? [] : [incompleteStatusBlocker(input)];
  const selected = selectDependencyTargets(input.status, policy);
  const resolutionRequests = buildPlanResolutionRequests(input.status, policy, selected.targets);
  const preliminaryBlockers = [
    ...statusBlockers,
    ...selected.blockers,
    ...resolutionRequests.blockers,
  ];
  const resolutions =
    preliminaryBlockers.length === 0
      ? await resolveAllAsync(resolutionRequests.requests, ports)
      : [];
  const protocol = await planProtocolAsync(
    input,
    policy,
    inputFingerprint,
    selected.targets,
    resolutions,
    ports,
  );
  const effects = planEffects(selected.targets.length > 0, protocol.effects);
  const unorderedSteps = buildPlanSteps(resolutions, protocol, effects);
  const ordered = orderPlanSteps(unorderedSteps);
  const blockers = [
    ...preliminaryBlockers,
    ...resolutions.flatMap(({ blockers: resolutionBlockers }) => resolutionBlockers),
    ...protocol.blockers,
    ...ordered.blockers,
  ];
  const planCore = stablePlanCore(input, policy, inputFingerprint, selected.targets, resolutions, protocol, effects, ordered.steps, blockers);
  const id = await ports.digest.digestAsync(JSON.stringify(planCore));
  return {
    schemaVersion: 1,
    operation: 'plan',
    id,
    ...planCore,
  };
}

/*** Hash stable planning evidence while recording registry freshness separately. */
async function fingerprintAsync(
  input: ApmPlanInput,
  policy: ReturnType<typeof normalizePlanPolicy>,
  ports: ApmPlanPorts,
): Promise<ApmPlanInputFingerprint> {
  const value = await ports.digest.digestAsync(buildPlanInputFingerprintSource(input.status, policy));
  return {
    value,
    statusSchemaVersion: input.status.schemaVersion,
    availabilityCheckedAt: availabilityCheckedAt(input),
  };
}

/*** Collect registry freshness timestamps without making them part of fingerprint validity. */
function availabilityCheckedAt(input: ApmPlanInput): readonly string[] {
  return [
    ...input.status.dependencies.flatMap(({ availability }) =>
      availability.checkedAt === undefined ? [] : [availability.checkedAt],
    ),
    ...input.status.hosts.flatMap(({ availability }) =>
      availability.checkedAt === undefined ? [] : [availability.checkedAt],
    ),
  ]
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort(compareText);
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

/*** Assemble stable sorted plan payload before deriving its immutable plan ID. */
function stablePlanCore(
  input: ApmPlanInput,
  policy: ReturnType<typeof normalizePlanPolicy>,
  inputFingerprint: ApmPlanInputFingerprint,
  targets: ApmPlanResult['targets'],
  resolutions: readonly ApmPlanResolutionResult[],
  protocol: ApmPlanProtocolResult,
  effects: readonly ApmReleaseEffect[],
  steps: ApmPlanResult['steps'],
  blockers: readonly ApmPlanBlocker[],
): Omit<ApmPlanResult, 'schemaVersion' | 'operation' | 'id'> {
  const files = [...resolutions.flatMap(({ files: items }) => items), ...protocol.files].sort(
    (left, right) => compareText(left.path, right.path),
  );
  const packages = resolutions
    .flatMap(({ packages: items }) => items)
    .sort((left, right) => compareText(left.id, right.id));
  const artifacts = [...resolutions.flatMap(({ artifacts: items }) => items), ...protocol.artifacts].sort(
    (left, right) => compareText(left.id, right.id),
  );
  const diagnostics = [
    ...input.status.diagnostics,
    ...resolutions.flatMap(({ diagnostics: items }) => items),
    ...protocol.diagnostics,
  ];
  return {
    rootPath: input.status.rootPath,
    complete:
      input.status.complete &&
      resolutions.every(({ complete }) => complete) &&
      protocol.complete &&
      blockers.length === 0,
    policy,
    executor: input.executor,
    inputFingerprint,
    targets,
    files,
    packages,
    artifacts,
    steps,
    effects,
    findings: [...input.status.findings, ...protocol.findings],
    blockers,
    diagnostics,
  };
}

/*** Explain why incomplete status evidence cannot produce a complete executable plan. */
function incompleteStatusBlocker(input: ApmPlanInput): ApmPlanBlocker {
  return {
    code: 'plan.status-incomplete',
    scope: { kind: 'project', path: input.status.rootPath },
    evidence: input.status.diagnostics.map(({ code }) => code),
    reason: 'Planning input is incomplete; missing evidence cannot be converted into a safe executable plan.',
    nextAction: 'Resolve status diagnostics and refresh evidence before applying an update plan.',
  };
}

/*** Explain an unexpected native resolver failure without leaking transport-specific exceptions into the plan schema. */
function resolverFailureBlocker(
  request: ApmPlanResolutionRequest,
  error: unknown,
): ApmPlanBlocker {
  return {
    code: 'plan.resolution-failed',
    scope: { kind: 'install-root', id: request.installRootId, path: request.installRootPath },
    evidence: [error instanceof Error ? error.message : 'unknown resolver failure'],
    reason: 'Native package-manager resolution failed before a complete target graph was produced.',
  };
}

/*** Explain missing package-owned planning where current status already proves pending owner work. */
function protocolUnavailableBlocker(): ApmPlanBlocker {
  return {
    code: 'plan.protocol-unavailable',
    scope: { kind: 'project' },
    evidence: [],
    reason: 'Migration or projection work is pending but no package-owned protocol planner is available.',
    nextAction: 'Load or install the required trusted owner extension before applying updates.',
  };
}

/*** Compare stable IDs without locale-dependent ordering. */
function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

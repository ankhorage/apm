import type {
  ApmPlanBlocker,
  ApmPlanDependencyTarget,
  ApmPlanPolicy,
  ApmPlanResolutionRequest,
} from '../../../types/plan.js';
import type { ApmInstallRootInventory, ApmStatusResult } from '../../../types/status.js';

/*** Build native resolution requests only for roots with selected updates or installation repair work. */
export function buildPlanResolutionRequests(
  status: ApmStatusResult,
  policy: ApmPlanPolicy,
  targets: readonly ApmPlanDependencyTarget[],
): {
  readonly requests: readonly ApmPlanResolutionRequest[];
  readonly blockers: readonly ApmPlanBlocker[];
} {
  return status.installRoots.reduce<{
    readonly requests: readonly ApmPlanResolutionRequest[];
    readonly blockers: readonly ApmPlanBlocker[];
  }>(
    (result, root) => {
      const rootTargets = targets.filter(({ installRootId }) => installRootId === root.id);
      if (rootTargets.length === 0 && !needsInstallRepair(status, policy, root.id)) return result;
      const request = resolutionRequest(status, root, rootTargets);
      return request === undefined
        ? {
            requests: result.requests,
            blockers: [...result.blockers, unavailableRootBlocker(root)],
          }
        : { requests: [...result.requests, request], blockers: result.blockers };
    },
    { requests: [], blockers: [] },
  );
}

/*** Convert one complete selected install root to native resolver input. */
function resolutionRequest(
  status: ApmStatusResult,
  root: ApmInstallRootInventory,
  targets: readonly ApmPlanDependencyTarget[],
): ApmPlanResolutionRequest | undefined {
  if (root.manager.state !== 'selected' || root.manager.name === undefined) return undefined;
  return {
    rootPath: status.rootPath,
    installRootId: root.id,
    installRootPath: root.rootPath,
    packagePaths: root.packagePaths,
    ...(root.lockfile.path === undefined ? {} : { lockfilePath: root.lockfile.path }),
    manager: root.manager.name,
    ...(root.manager.version === undefined ? {} : { managerVersion: root.manager.version }),
    ...(root.linker === undefined ? {} : { linker: root.linker }),
    targets,
  };
}

/*** Detect missing installations that can be repaired without changing dependency policy. */
function needsInstallRepair(
  status: ApmStatusResult,
  policy: ApmPlanPolicy,
  installRootId: string,
): boolean {
  return (
    policy.repairInstallations &&
    status.dependencies.some(
      (dependency) =>
        dependency.installRootId === installRootId &&
        dependency.findings.some(({ code }) => code === 'install-absent'),
    )
  );
}

/*** Block roots whose package manager selection cannot be resolved deterministically. */
function unavailableRootBlocker(root: ApmInstallRootInventory): ApmPlanBlocker {
  return {
    code: 'plan.resolution-failed',
    scope: { kind: 'install-root', id: root.id, path: root.rootPath },
    evidence: [root.manager.state, ...root.lockfile.evidence],
    reason:
      'Install root has no uniquely selected supported package manager for native resolution.',
    nextAction: 'Resolve package-manager/lockfile ambiguity before planning an update.',
  };
}

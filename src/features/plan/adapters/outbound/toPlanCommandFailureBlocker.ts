import type { ApmPlanBlocker, ApmPlanResolutionRequest } from '../../../../types/plan.js';
import type {
  ApmPackageManagerPlanCommand,
  ApmPlanCommandResult,
} from '../../../../types/plan-staging.js';

/*** Classify native package-manager failures without embedding raw credential-bearing output. */
export function toPlanCommandFailureBlocker(
  request: ApmPlanResolutionRequest,
  command: ApmPackageManagerPlanCommand,
  result: ApmPlanCommandResult,
): ApmPlanBlocker {
  const peerConflict = /ERESOLVE|peer dependenc|peerDependencies/iu.test(result.stderr);
  return {
    code: peerConflict ? 'plan.peer-conflict' : 'plan.resolution-failed',
    scope: { kind: 'install-root', id: request.installRootId, path: request.installRootPath },
    evidence: [command.executable, ...command.args, `exit:${result.exitCode}`],
    reason: peerConflict
      ? 'Native package-manager resolution rejected the selected graph because peer requirements conflict.'
      : 'Native package-manager planning command failed before producing a complete reviewed lock graph.',
    nextAction: peerConflict
      ? 'Choose compatible package targets or resolve the peer constraint explicitly.'
      : 'Run the package manager manually for full diagnostics, then re-run APM status and plan.',
  };
}

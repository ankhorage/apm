import type { ApmPlanResolutionRequest } from '../../../../types/plan.js';
import type { ApmPackageManagerPlanCommand } from '../../../../types/plan-staging.js';
import { buildPackageManagerPlanReconciliationCommand } from './buildPackageManagerPlanReconciliationCommand.js';

/*** Build native lockfile-only package-manager commands with lifecycle execution disabled. */
export function buildPackageManagerPlanCommands(
  request: ApmPlanResolutionRequest,
): readonly ApmPackageManagerPlanCommand[] {
  const direct = request.targets.filter(({ direct }) => direct);
  const transitive = request.targets.filter(({ direct }) => !direct);
  const base =
    direct.length === 0 ? [] : [buildPackageManagerPlanReconciliationCommand(request.manager)];
  return [
    ...base,
    ...transitive.map((target) =>
      transitiveResolutionCommand(request.manager, target.name, target.targetVersion),
    ),
  ];
}

/*** Ask the native resolver to re-resolve one transitive package without promoting it to direct. */
function transitiveResolutionCommand(
  manager: ApmPlanResolutionRequest['manager'],
  name: string,
  version: string,
): ApmPackageManagerPlanCommand {
  if (manager === 'npm') {
    return {
      executable: 'npm',
      args: [
        'update',
        name,
        '--package-lock-only',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--strict-peer-deps',
      ],
    };
  }
  if (manager === 'pnpm') {
    return {
      executable: 'pnpm',
      args: ['update', `${name}@${version}`, '--lockfile-only', '--ignore-scripts'],
    };
  }
  if (manager === 'yarn') {
    return {
      executable: 'yarn',
      args: ['up', `${name}@${version}`, '-R'],
    };
  }
  return {
    executable: 'bun',
    args: ['update', `${name}@${version}`, '--lockfile-only', '--ignore-scripts'],
  };
}

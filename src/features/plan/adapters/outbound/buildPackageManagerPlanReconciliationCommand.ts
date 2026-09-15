import type { ApmPlanResolutionRequest } from '../../../../types/plan.js';
import type { ApmPackageManagerPlanCommand } from '../../../../types/plan-staging.js';

/*** Build the native lockfile-only reconciliation command with lifecycle execution disabled. */
export function buildPackageManagerPlanReconciliationCommand(
  manager: ApmPlanResolutionRequest['manager'],
): ApmPackageManagerPlanCommand {
  if (manager === 'npm') {
    return {
      executable: 'npm',
      args: [
        'install',
        '--package-lock-only',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--strict-peer-deps',
      ],
    };
  }
  if (manager === 'pnpm') {
    return { executable: 'pnpm', args: ['install', '--lockfile-only', '--ignore-scripts'] };
  }
  if (manager === 'yarn') {
    return { executable: 'yarn', args: ['install', '--mode=update-lockfile'] };
  }
  return { executable: 'bun', args: ['install', '--lockfile-only', '--ignore-scripts'] };
}

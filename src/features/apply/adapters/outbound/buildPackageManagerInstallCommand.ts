import type { ApmPackageManagerCommand } from '../../../../types/package-manager-command.js';
import type { ApmPlanStepExecution } from '../../../../types/plan-execution.js';

/*** Build the native frozen-lock install command for one reviewed executable install descriptor. */
export function buildPackageManagerInstallCommand(
  execution: Extract<ApmPlanStepExecution, { readonly kind: 'install' }>,
): ApmPackageManagerCommand {
  if (execution.manager === 'npm') {
    return {
      executable: 'npm',
      args: [
        'ci',
        '--no-audit',
        '--no-fund',
        ...(execution.lifecycleScripts ? [] : ['--ignore-scripts']),
      ],
    };
  }
  if (execution.manager === 'pnpm') {
    return {
      executable: 'pnpm',
      args: [
        'install',
        '--frozen-lockfile',
        ...(execution.lifecycleScripts ? [] : ['--ignore-scripts']),
      ],
    };
  }
  if (execution.manager === 'yarn') {
    return { executable: 'yarn', args: ['install', '--immutable'] };
  }
  return {
    executable: 'bun',
    args: [
      'install',
      '--frozen-lockfile',
      ...(execution.lifecycleScripts ? [] : ['--ignore-scripts']),
    ],
  };
}

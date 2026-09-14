import type { ApmApplyJournal, ApmApplyStepExecutionResult } from '../../../../types/apply.js';
import type { ApmPlanStep } from '../../../../types/plan.js';
import { runPackageManagerCommandAsync } from '../../../../utils/runPackageManagerCommandAsync.js';
import { buildPackageManagerInstallCommand } from './buildPackageManagerInstallCommand.js';

/*** Materialize the exact reviewed lock graph with the frozen package manager and script policy. */
export async function executeNodeInstallStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
): Promise<ApmApplyStepExecutionResult> {
  if (step.execution.kind !== 'install') return invalidInstallStep(step.id);
  const version = await runPackageManagerCommandAsync(
    { executable: step.execution.manager, args: ['--version'] },
    step.execution.installRootPath,
    { lifecycleScripts: false },
  );
  if (version.exitCode !== 0) {
    return commandFailure(step.id, step.execution.manager, 'version', version.exitCode);
  }
  const actualVersion = version.stdout.trim();
  if (
    step.execution.managerVersion !== undefined &&
    actualVersion !== step.execution.managerVersion
  ) {
    return {
      state: 'failed',
      evidence: [
        `manager:${step.execution.manager}`,
        `planned:${step.execution.managerVersion}`,
        `actual:${actualVersion || 'unknown'}`,
      ],
      diagnostics: [],
      failure: {
        code: 'apply.manager-version-mismatch',
        reason: 'Installed package-manager version differs from the version frozen into the plan.',
        evidence: [step.execution.managerVersion, actualVersion || 'unknown'],
        nextAction: 'Use the reviewed package-manager version or create a new plan.',
      },
    };
  }
  const command = buildPackageManagerInstallCommand(step.execution);
  const result = await runPackageManagerCommandAsync(
    command,
    step.execution.installRootPath,
    { lifecycleScripts: step.execution.lifecycleScripts },
  );
  return result.exitCode === 0
    ? {
        state: 'completed',
        evidence: [
          `manager:${step.execution.manager}`,
          `version:${actualVersion || step.execution.managerVersion || 'unknown'}`,
          `packages:${step.execution.packageIds.length}`,
        ],
        diagnostics: [],
      }
    : commandFailure(step.id, step.execution.manager, 'install', result.exitCode);
}

/*** Reject an execution request whose reviewed step is not an install descriptor. */
function invalidInstallStep(stepId: string): ApmApplyStepExecutionResult {
  return {
    state: 'failed',
    evidence: [stepId],
    diagnostics: [],
    failure: {
      code: 'apply.journal-invalid',
      reason: 'Reviewed install step does not contain an executable install descriptor.',
      evidence: [stepId],
    },
  };
}

/*** Convert package-manager command failure to bounded credential-free execution evidence. */
function commandFailure(
  stepId: string,
  manager: string,
  phase: 'version' | 'install',
  exitCode: number,
): ApmApplyStepExecutionResult {
  return {
    state: 'failed',
    evidence: [stepId, `manager:${manager}`, `phase:${phase}`, `exit:${exitCode}`],
    diagnostics: [],
    failure: {
      code: 'apply.install-failed',
      reason: `Package-manager ${phase} command failed for the reviewed install step.`,
      evidence: [`manager:${manager}`, `phase:${phase}`, `exit:${exitCode}`],
      nextAction: 'Resolve the local package-manager failure and resume the same durable operation.',
    },
  };
}

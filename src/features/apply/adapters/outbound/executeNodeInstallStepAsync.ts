import type { ApmApplyJournal, ApmApplyStepExecutionResult } from '../../../../types/apply.js';
import type { ApmPlanStep } from '../../../../types/plan.js';
import { runPackageManagerCommandAsync } from '../../../../utils/runPackageManagerCommandAsync.js';
import { buildPackageManagerInstallCommand } from './buildPackageManagerInstallCommand.js';

type InstallExecution = Extract<ApmPlanStep['execution'], { readonly kind: 'install' }>;

type ManagerIdentityResult =
  | { readonly observedVersion: string }
  | { readonly failure: ApmApplyStepExecutionResult };

/*** Materialize the exact reviewed lock graph with the frozen package manager and script policy. */
export async function executeNodeInstallStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
): Promise<ApmApplyStepExecutionResult> {
  if (step.execution.kind !== 'install') return invalidInstallStep(step.id);
  const identity = await inspectManagerIdentityAsync(step.id, step.execution);
  if ('failure' in identity) return identity.failure;
  const command = buildPackageManagerInstallCommand(step.execution);
  const result = await runPackageManagerCommandAsync(command, step.execution.installRootPath, {
    lifecycleScripts: step.execution.lifecycleScripts,
  });
  return result.exitCode === 0
    ? {
        state: 'completed',
        evidence: [
          `manager:${step.execution.manager}`,
          `version:${identity.observedVersion}`,
          `packages:${step.execution.packageIds.length}`,
        ],
        diagnostics: [],
      }
    : commandFailure(step.id, step.execution.manager, 'install', result.exitCode);
}

/*** Verify the executable and exact manager version frozen into the reviewed install descriptor. */
async function inspectManagerIdentityAsync(
  stepId: string,
  execution: InstallExecution,
): Promise<ManagerIdentityResult> {
  const result = await runPackageManagerCommandAsync(
    { executable: execution.manager, args: ['--version'] },
    execution.installRootPath,
    { lifecycleScripts: false },
  );
  if (result.exitCode !== 0) {
    return { failure: commandFailure(stepId, execution.manager, 'version', result.exitCode) };
  }
  const actualVersion = result.stdout.trim();
  const observedVersion = actualVersion === '' ? (execution.managerVersion ?? 'unknown') : actualVersion;
  return execution.managerVersion !== undefined && actualVersion !== execution.managerVersion
    ? { failure: managerVersionMismatch(execution, actualVersion) }
    : { observedVersion };
}

/*** Reject a runtime package-manager version that differs from the reviewed executor identity. */
function managerVersionMismatch(
  execution: InstallExecution,
  actualVersion: string,
): ApmApplyStepExecutionResult {
  const actual = actualVersion === '' ? 'unknown' : actualVersion;
  return {
    state: 'failed',
    evidence: [
      `manager:${execution.manager}`,
      `planned:${execution.managerVersion ?? 'unknown'}`,
      `actual:${actual}`,
    ],
    diagnostics: [],
    failure: {
      code: 'apply.manager-version-mismatch',
      reason: 'Installed package-manager version differs from the version frozen into the plan.',
      evidence: [execution.managerVersion ?? 'unknown', actual],
      nextAction: 'Use the reviewed package-manager version or create a new plan.',
    },
  };
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
      nextAction:
        'Resolve the local package-manager failure and resume the same durable operation.',
    },
  };
}

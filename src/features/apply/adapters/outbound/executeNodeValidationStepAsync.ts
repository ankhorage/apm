import { runProcessWithTimeout } from '@ankhorage/utility/node/process';
import { resolvePathWithinRoot } from '@ankhorage/utility/node/path';

import type { ApmApplyJournal, ApmApplyStepExecutionResult } from '../../../../types/apply.js';
import type { ApmPlanValidationCheck } from '../../../../types/plan-execution.js';
import type { ApmPlanStep } from '../../../../types/plan.js';
import { observeNodeInstallStepAsync } from './observeNodeInstallStepAsync.js';

const DEFAULT_VALIDATION_TIMEOUT_MS = 120_000;

/*** Execute every required reviewed validation check without turning omitted/failed checks into success. */
export async function executeNodeValidationStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
): Promise<ApmApplyStepExecutionResult> {
  if (step.execution.kind !== 'validation') return invalidValidationStep(step.id);
  const results = await runChecksAsync(journal, step.execution.checks);
  const failed = results.find(({ passed }) => !passed);
  return failed === undefined
    ? {
        state: 'completed',
        evidence: results.map(({ id }) => `validation:${id}:passed`),
        diagnostics: [],
      }
    : {
        state: 'failed',
        evidence: results.map(({ id, passed }) => `validation:${id}:${passed ? 'passed' : 'failed'}`),
        diagnostics: [],
        failure: {
          code: 'apply.validation-failed',
          reason: failed.reason,
          evidence: [failed.id],
          nextAction: 'Fix the validation failure, then resume the same durable operation.',
        },
      };
}

interface ValidationCheckResult {
  readonly id: string;
  readonly passed: boolean;
  readonly reason: string;
}

/*** Run reviewed validation checks sequentially so their ordering remains deterministic. */
async function runChecksAsync(
  journal: ApmApplyJournal,
  checks: readonly ApmPlanValidationCheck[],
): Promise<readonly ValidationCheckResult[]> {
  const [check, ...remaining] = checks;
  if (check === undefined) return [];
  const current = await runCheckAsync(journal, check);
  if (!current.passed) return [current];
  return [current, ...(await runChecksAsync(journal, remaining))];
}

/*** Execute one dependency-state or bounded command validation. */
async function runCheckAsync(
  journal: ApmApplyJournal,
  check: ApmPlanValidationCheck,
): Promise<ValidationCheckResult> {
  if (check.kind === 'dependency-state') return dependencyStateCheckAsync(journal, check.id);
  const cwd = resolvePathWithinRoot(journal.rootPath, check.cwd ?? '.', { allowRoot: true });
  try {
    await runProcessWithTimeout({
      command: check.executable,
      args: check.args,
      cwd,
      stdio: 'ignore',
      spawnTimeoutMs: 10_000,
      timeoutMs: check.timeoutMs ?? DEFAULT_VALIDATION_TIMEOUT_MS,
      killGraceMs: 5_000,
    });
    return { id: check.id, passed: true, reason: 'Validation command completed successfully.' };
  } catch (error) {
    return {
      id: check.id,
      passed: false,
      reason: error instanceof Error ? error.message : 'Validation command failed.',
    };
  }
}

/*** Verify every reviewed install step against local lock/installed evidence. */
async function dependencyStateCheckAsync(
  journal: ApmApplyJournal,
  id: string,
): Promise<ValidationCheckResult> {
  const installSteps = journal.plan.steps.filter(({ execution }) => execution.kind === 'install');
  const observations = await Promise.all(
    installSteps.map((step) => observeNodeInstallStepAsync(journal, step)),
  );
  const passed = observations.every(({ state }) => state === 'satisfied');
  return {
    id,
    passed,
    reason: passed
      ? 'Reviewed dependency graph is fully materialized.'
      : 'Reviewed dependency graph is not fully materialized.',
  };
}

/*** Reject malformed in-memory validation step linkage. */
function invalidValidationStep(stepId: string): ApmApplyStepExecutionResult {
  return {
    state: 'failed',
    evidence: [stepId],
    diagnostics: [],
    failure: {
      code: 'apply.journal-invalid',
      reason: 'Reviewed validation step does not contain executable validation checks.',
      evidence: [stepId],
    },
  };
}

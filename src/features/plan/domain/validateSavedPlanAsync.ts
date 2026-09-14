import type {
  ApmPlanBlocker,
  ApmPlanDigestPort,
  ApmPlanExecutorIdentity,
  ApmPlanResult,
} from '../../../types/plan.js';
import type { ApmStatusResult } from '../../../types/status.js';
import { createPlanInputFingerprintAsync } from './createPlanInputFingerprintAsync.js';

/*** Revalidate a saved plan against current project evidence and executor identity before mutation. */
export async function validateSavedPlanAsync(
  plan: ApmPlanResult,
  status: ApmStatusResult,
  executor: ApmPlanExecutorIdentity,
  digest: ApmPlanDigestPort,
): Promise<readonly ApmPlanBlocker[]> {
  const currentFingerprint = await createPlanInputFingerprintAsync(status, plan.policy, digest);
  return [
    ...(currentFingerprint.value === plan.inputFingerprint.value
      ? []
      : [inputChangedBlocker(plan.inputFingerprint.value, currentFingerprint.value)]),
    ...(executorMatches(plan.executor, executor)
      ? []
      : [executorMismatchBlocker(plan.executor, executor)]),
  ];
}

/*** Compare every executor field that can change planning/apply semantics. */
function executorMatches(
  planned: ApmPlanExecutorIdentity,
  current: ApmPlanExecutorIdentity,
): boolean {
  return (
    planned.apmVersion === current.apmVersion &&
    planned.runtime === current.runtime &&
    planned.runtimeVersion === current.runtimeVersion
  );
}

/*** Report changed semantic planning evidence without treating registry freshness as project drift. */
function inputChangedBlocker(expected: string, actual: string): ApmPlanBlocker {
  return {
    code: 'plan.input-changed',
    scope: { kind: 'project' },
    evidence: [expected, actual],
    reason: 'Current planning evidence no longer matches the reviewed plan fingerprint.',
    nextAction: 'Discard the stale plan and create a new plan from current project evidence.',
  };
}

/*** Report executor drift that could change package/protocol execution semantics. */
function executorMismatchBlocker(
  planned: ApmPlanExecutorIdentity,
  current: ApmPlanExecutorIdentity,
): ApmPlanBlocker {
  return {
    code: 'plan.executor-incompatible',
    scope: { kind: 'host', id: 'apm' },
    evidence: [executorKey(planned), executorKey(current)],
    reason:
      'Current APM/runtime executor does not match the executor frozen into the reviewed plan.',
    nextAction: 'Re-plan with the current executor before applying project mutations.',
  };
}

/*** Render one stable executor identity for blocker evidence. */
function executorKey(executor: ApmPlanExecutorIdentity): string {
  return [executor.apmVersion, executor.runtime, executor.runtimeVersion ?? ''].join('\0');
}

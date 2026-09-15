import type { ApmApplyBlocker, ApmApplyInput, ApmApplyJournal } from '../../../types/apply.js';
import type { ApmPlanExecutorIdentity } from '../../../types/plan.js';
import { createApplyBlocker } from './createApplyBlocker.js';

/*** Validate journal identity and executor compatibility without treating applied changes as staleness. */
export function validateResumeJournal(
  input: Extract<ApmApplyInput, { readonly mode: 'resume' }>,
  journal: ApmApplyJournal,
  executor: ApmPlanExecutorIdentity,
  lockedPlanId?: string,
): readonly ApmApplyBlocker[] {
  return [
    ...(lockedPlanId === undefined || journal.plan.id === lockedPlanId
      ? []
      : [journalPlanChangedBlocker(journal, lockedPlanId)]),
    ...(journal.operationId === input.operationId &&
    journal.rootPath === input.rootPath &&
    journal.plan.rootPath === input.rootPath
      ? []
      : [journalIdentityBlocker(input, journal)]),
    ...(journal.plan.complete
      ? []
      : [createApplyBlocker({ kind: 'plan-incomplete', plan: journal.plan })]),
    ...(executorMatches(journal.plan.executor, executor)
      ? []
      : [executorIncompatibleBlocker(journal.plan.executor, executor)]),
  ];
}

/*** Compare every executor field frozen into the reviewed plan. */
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

/*** Explain a durable journal whose project/operation identity differs from the resume request. */
function journalIdentityBlocker(
  input: Extract<ApmApplyInput, { readonly mode: 'resume' }>,
  journal: ApmApplyJournal,
): ApmApplyBlocker {
  return {
    code: 'apply.journal-invalid',
    scope: { kind: 'operation', id: input.operationId, path: input.rootPath },
    evidence: [journal.operationId, journal.rootPath, journal.plan.rootPath],
    reason: 'Durable operation journal identity does not match the requested project operation.',
    nextAction: 'Use the journal from the matching project root and operation ID.',
  };
}

/*** Reject a durable plan replaced between the preliminary journal read and acquiring its writer lock. */
function journalPlanChangedBlocker(
  journal: ApmApplyJournal,
  lockedPlanId: string,
): ApmApplyBlocker {
  return {
    code: 'apply.journal-invalid',
    scope: { kind: 'operation', id: journal.operationId, path: journal.rootPath },
    evidence: [lockedPlanId, journal.plan.id],
    reason: 'Durable operation plan no longer matches the plan used to acquire the writer lock.',
    nextAction: 'Inspect the durable journal and resume only the operation for the reviewed plan.',
  };
}

/*** Reject resume under a host/runtime that differs from the reviewed plan executor identity. */
function executorIncompatibleBlocker(
  planned: ApmPlanExecutorIdentity,
  current: ApmPlanExecutorIdentity,
): ApmApplyBlocker {
  return {
    code: 'apply.executor-incompatible',
    scope: { kind: 'host', id: 'apm' },
    evidence: [executorKey(planned), executorKey(current)],
    reason:
      'Current APM/runtime executor does not match the executor frozen into the operation plan.',
    nextAction: 'Use the reviewed executor or create a new plan with the current executor.',
  };
}

/*** Render one stable executor identity for recovery blocker evidence. */
function executorKey(executor: ApmPlanExecutorIdentity): string {
  return [executor.apmVersion, executor.runtime, executor.runtimeVersion ?? ''].join('\0');
}

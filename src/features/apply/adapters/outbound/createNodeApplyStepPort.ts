import type {
  ApmApplyStepExecutionResult,
  ApmApplyStepObservation,
  ApmApplyStepPort,
} from '../../../../types/apply.js';
import type { ApmPlanDigestPort } from '../../../../types/plan.js';
import { reviewedStepFilePaths } from '../../domain/reviewedStepFilePaths.js';
import { ensureApplyStepSnapshotAsync } from './ensureApplyStepSnapshotAsync.js';
import { executeNodeFileStepAsync } from './executeNodeFileStepAsync.js';
import { executeNodeInstallStepAsync } from './executeNodeInstallStepAsync.js';
import { executeNodeValidationStepAsync } from './executeNodeValidationStepAsync.js';
import { observeNodeFileStepAsync } from './observeNodeFileStepAsync.js';
import { observeNodeInstallStepAsync } from './observeNodeInstallStepAsync.js';
import { rollbackNodeFileStepAsync } from './rollbackNodeFileStepAsync.js';
import { restoreApplyStepSnapshotAsync } from './restoreApplyStepSnapshotAsync.js';

/*** Create the Node step adapter for reviewed local effects plus an optional trusted owner-code boundary. */
export function createNodeApplyStepPort(options: NodeApplyStepOptions): ApmApplyStepPort {
  return {
    observeAsync: ({ journal, step }) => observeAsync(journal, step, options),
    executeAsync: ({ journal, step }) => executeAsync(journal, step, options),
    rollbackAsync: ({ journal, step }) => rollbackAsync(journal, step, options),
  };
}

interface NodeApplyStepOptions {
  readonly digest: ApmPlanDigestPort;
  readonly owner?: ApmApplyStepPort;
}

/*** Observe one reviewed step through its concrete local or package-owner adapter. */
async function observeAsync(
  journal: Parameters<ApmApplyStepPort['observeAsync']>[0]['journal'],
  step: Parameters<ApmApplyStepPort['observeAsync']>[0]['step'],
  options: NodeApplyStepOptions,
): Promise<ApmApplyStepObservation> {
  switch (step.execution.kind) {
    case 'dependency-files':
      return observeNodeFileStepAsync(journal.rootPath, journal.plan.files, step, options.digest);
    case 'install':
      return observeNodeInstallStepAsync(journal, step);
    case 'validation':
      return { state: 'pending', evidence: step.execution.checks.map(({ id }) => id) };
    case 'migration':
    case 'projection':
      return options.owner === undefined
        ? ownerUnavailableObservation(step.id)
        : options.owner.observeAsync({ journal, step });
    case 'host-restart':
    case 'follow-up':
      return { state: 'satisfied', evidence: step.evidence };
  }
}

/*** Execute one reviewed step without allowing local adapters to handle package-owner code implicitly. */
async function executeAsync(
  journal: Parameters<ApmApplyStepPort['executeAsync']>[0]['journal'],
  step: Parameters<ApmApplyStepPort['executeAsync']>[0]['step'],
  options: NodeApplyStepOptions,
): Promise<ApmApplyStepExecutionResult> {
  switch (step.execution.kind) {
    case 'dependency-files':
      return executeNodeFileStepAsync(journal, step, options.digest);
    case 'install':
      return executeNodeInstallStepAsync(journal, step);
    case 'validation':
      return executeNodeValidationStepAsync(journal, step);
    case 'migration':
    case 'projection':
      if (options.owner === undefined) return ownerUnavailableExecution(step.id);
      if (reviewedStepFilePaths(step).length > 0) await ensureApplyStepSnapshotAsync(journal, step);
      return options.owner.executeAsync({ journal, step });
    case 'host-restart':
    case 'follow-up':
      return deferredExecution(step.id);
  }
}

/*** Roll back only effect kinds whose owning recovery policy can actually request rollback. */
async function rollbackAsync(
  journal: Parameters<ApmApplyStepPort['rollbackAsync']>[0]['journal'],
  step: Parameters<ApmApplyStepPort['rollbackAsync']>[0]['step'],
  options: NodeApplyStepOptions,
): Promise<ApmApplyStepExecutionResult> {
  if (step.execution.kind === 'dependency-files') return rollbackNodeFileStepAsync(journal, step);
  if (step.execution.kind === 'migration' || step.execution.kind === 'projection') {
    if (options.owner === undefined) return ownerUnavailableExecution(step.id);
    const owner = await options.owner.rollbackAsync({ journal, step });
    if (owner.state !== 'completed' || reviewedStepFilePaths(step).length === 0) return owner;
    const restored = await restoreApplyStepSnapshotAsync(journal, step);
    return { state: 'completed', evidence: [...owner.evidence, ...restored], diagnostics: owner.diagnostics };
  }
  return {
    state: 'unknown',
    evidence: [step.id],
    diagnostics: [],
    failure: {
      code: 'apply.rollback-unsupported',
      reason: 'Reviewed step kind does not support automatic rollback.',
      evidence: [step.id],
    },
  };
}

/*** Keep absent owner-code adapters explicit during resume observation. */
function ownerUnavailableObservation(stepId: string): ApmApplyStepObservation {
  return {
    state: 'unknown',
    evidence: [stepId],
    reason: 'Trusted package-owner executor is unavailable for this reviewed step.',
  };
}

/*** Return a deterministic failure when a reviewed owner step cannot be executed by this host. */
function ownerUnavailableExecution(stepId: string): ApmApplyStepExecutionResult {
  return {
    state: 'failed',
    evidence: [stepId],
    diagnostics: [],
    failure: {
      code: 'apply.owner-executor-unavailable',
      reason: 'Trusted package-owner executor is unavailable for this reviewed step.',
      evidence: [stepId],
      nextAction: 'Load the exact reviewed owner artifact before resuming the operation.',
    },
  };
}

/*** Guard against accidentally executing shipment/restart follow-up steps through the local effect adapter. */
function deferredExecution(stepId: string): ApmApplyStepExecutionResult {
  return {
    state: 'failed',
    evidence: [stepId],
    diagnostics: [],
    failure: {
      code: 'apply.deferred-step-executed',
      reason: 'Shipment/restart follow-up steps are accounted for but never executed incidentally by apply.',
      evidence: [stepId],
    },
  };
}

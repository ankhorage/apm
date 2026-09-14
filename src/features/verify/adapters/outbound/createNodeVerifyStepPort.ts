import type { ApmPlanDigestPort, ApmPlanStep } from '../../../../types/plan.js';
import type {
  ApmVerifyCheckKind,
  ApmVerifyCheckResult,
  ApmVerifyStepPort,
} from '../../../../types/verify.js';
import { executeNodeValidationStepAsync } from '../../../apply/adapters/outbound/executeNodeValidationStepAsync.js';
import { observeNodeFileStepAsync } from '../../../apply/adapters/outbound/observeNodeFileStepAsync.js';
import { observeNodeInstallStepAsync } from '../../../apply/adapters/outbound/observeNodeInstallStepAsync.js';

/*** Create Node verification adapters for local postconditions plus an optional trusted owner verifier. */
export function createNodeVerifyStepPort(options: NodeVerifyStepOptions): ApmVerifyStepPort {
  return {
    verifyAsync: (input) => verifyStepAsync(input, options),
  };
}

interface NodeVerifyStepOptions {
  readonly digest: ApmPlanDigestPort;
  readonly owner?: ApmVerifyStepPort;
}

/*** Verify one reviewed local step through its owning concrete adapter. */
async function verifyStepAsync(
  input: Parameters<ApmVerifyStepPort['verifyAsync']>[0],
  options: NodeVerifyStepOptions,
): Promise<readonly ApmVerifyCheckResult[]> {
  switch (input.step.execution.kind) {
    case 'dependency-files':
      return [
        observationCheck(
          input.step,
          await observeNodeFileStepAsync(
            input.journal.rootPath,
            input.plan.files,
            input.step,
            options.digest,
          ),
        ),
      ];
    case 'install':
      return [
        observationCheck(input.step, await observeNodeInstallStepAsync(input.journal, input.step)),
      ];
    case 'validation':
      return [
        validationCheck(
          input.step,
          await executeNodeValidationStepAsync(input.journal, input.step),
        ),
      ];
    case 'migration':
    case 'projection':
      return options.owner === undefined
        ? [ownerUnavailableCheck(input.step)]
        : options.owner.verifyAsync(input);
    case 'host-restart':
    case 'follow-up':
      return [];
  }
}

/*** Convert an observed local postcondition into structured verify evidence. */
function observationCheck(
  step: ApmPlanStep,
  observation: Awaited<ReturnType<typeof observeNodeFileStepAsync>>,
): ApmVerifyCheckResult {
  return {
    id: `verify:${step.id}`,
    kind: verificationKind(step),
    status:
      observation.state === 'satisfied'
        ? 'passed'
        : observation.state === 'unknown'
          ? 'unknown'
          : 'failed',
    evidence: observation.evidence,
    ...(observation.reason === undefined ? {} : { reason: observation.reason }),
  };
}

/*** Convert a replayed reviewed validation command/check into verification evidence. */
function validationCheck(
  step: ApmPlanStep,
  execution: Awaited<ReturnType<typeof executeNodeValidationStepAsync>>,
): ApmVerifyCheckResult {
  return {
    id: `verify:${step.id}`,
    kind: 'validation',
    status:
      execution.state === 'completed'
        ? 'passed'
        : execution.state === 'unknown'
          ? 'unknown'
          : 'failed',
    evidence: execution.evidence,
    ...(execution.failure === undefined ? {} : { reason: execution.failure.reason }),
    ...(execution.failure?.nextAction === undefined
      ? {}
      : { nextAction: execution.failure.nextAction }),
  };
}

/*** Keep absent package-owner verification explicit rather than treating a completed journal as proof. */
function ownerUnavailableCheck(step: ApmPlanStep): ApmVerifyCheckResult {
  return {
    id: `verify:${step.id}`,
    kind: verificationKind(step),
    status: 'unknown',
    evidence: [step.id],
    reason: 'Trusted package-owner verifier is unavailable for this reviewed step.',
    nextAction: 'Load the exact reviewed owner artifact and verify the operation again.',
  };
}

/*** Map reviewed local steps to their public verification evidence category. */
function verificationKind(step: ApmPlanStep): ApmVerifyCheckKind {
  if (step.execution.kind === 'migration') return 'migration';
  if (step.execution.kind === 'projection') return 'projection';
  if (step.execution.kind === 'validation') return 'validation';
  return 'dependency-state';
}

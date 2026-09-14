import type { ApmApplyJournal } from '../../../types/apply.js';
import type { ApmPlanStep } from '../../../types/plan.js';
import type {
  ApmVerifyCheckKind,
  ApmVerifyCheckResult,
  ApmVerifyInput,
  ApmVerifyPorts,
  ApmVerifyResult,
} from '../../../types/verify.js';

/*** Verify one durable applied operation against fresh project and reviewed step postconditions. */
export async function verifyAsync(
  input: ApmVerifyInput,
  ports: ApmVerifyPorts,
): Promise<ApmVerifyResult> {
  const journal = await ports.journal.readAsync(input.rootPath, input.operationId);
  if (journal === undefined) return missingOperationResult(input);
  if (journal.status !== 'completed') return incompleteOperationResult(input, journal);

  const status = await ports.status.inspectStatusAsync(input.rootPath);
  const operationCheck = completedOperationCheck(journal.operationId);
  const evidenceCheck = statusEvidenceCheck(status.complete);
  const steps = journal.plan.steps.filter(requiresVerification);
  const stepChecks = await Promise.all(
    steps.map(async (step) => verifiedStepChecksAsync(journal, step, status, ports)),
  );
  const validationCoverage = validationCoverageCheck(journal.plan.steps);
  const checks = [
    operationCheck,
    evidenceCheck,
    ...stepChecks.flat(),
    ...(validationCoverage === undefined ? [] : [validationCoverage]),
  ];

  return {
    schemaVersion: 1,
    operation: 'verify',
    operationId: journal.operationId,
    planId: journal.plan.id,
    rootPath: journal.rootPath,
    verified: checks.every(({ status: checkStatus }) => checkStatus === 'passed'),
    checks,
    findings: status.findings,
    followUp: journal.plan.effects,
    diagnostics: status.diagnostics,
  };
}

/*** Require fresh verification evidence for every local step rather than accepting an empty adapter response. */
async function verifiedStepChecksAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
  status: Parameters<ApmVerifyPorts['step']['verifyAsync']>[0]['status'],
  ports: ApmVerifyPorts,
): Promise<readonly ApmVerifyCheckResult[]> {
  const checks = await ports.step.verifyAsync({ journal, plan: journal.plan, step, status });
  return checks.length === 0 ? [missingStepVerificationCheck(step)] : checks;
}

/*** Exclude shipment/restart follow-up from local verification while preserving it in followUp output. */
function requiresVerification(step: ApmPlanStep): boolean {
  return step.execution.kind !== 'follow-up' && step.execution.kind !== 'host-restart';
}

/*** Require at least one structured validation step whenever the plan contains local executable work. */
function validationCoverageCheck(steps: readonly ApmPlanStep[]): ApmVerifyCheckResult | undefined {
  const localSteps = steps.filter(requiresVerification);
  if (
    localSteps.length === 0 ||
    localSteps.some(({ execution }) => execution.kind === 'validation')
  ) {
    return undefined;
  }
  return {
    id: 'validation:required',
    kind: 'validation',
    status: 'failed',
    evidence: localSteps.map(({ id }) => id),
    reason: 'Applied local work has no reviewed validation step.',
    nextAction: 'Create a new plan that includes the required application validation evidence.',
  };
}

/*** Mark the durable operation itself as a required successful verification precondition. */
function completedOperationCheck(operationId: string): ApmVerifyCheckResult {
  return {
    id: 'operation:completed',
    kind: 'operation',
    status: 'passed',
    evidence: [operationId],
  };
}

/*** Treat incomplete fresh project evidence as unknown rather than verified success. */
function statusEvidenceCheck(complete: boolean): ApmVerifyCheckResult {
  return complete
    ? {
        id: 'status:evidence',
        kind: 'dependency-state',
        status: 'passed',
        evidence: ['complete'],
      }
    : {
        id: 'status:evidence',
        kind: 'dependency-state',
        status: 'unknown',
        evidence: ['incomplete'],
        reason: 'Fresh project evidence is incomplete, so the applied graph cannot be verified.',
      };
}

/*** Convert a missing durable operation into a structured verification failure. */
function missingOperationResult(input: ApmVerifyInput): ApmVerifyResult {
  return {
    schemaVersion: 1,
    operation: 'verify',
    operationId: input.operationId,
    rootPath: input.rootPath,
    verified: false,
    checks: [
      {
        id: 'operation:journal',
        kind: 'operation',
        status: 'failed',
        evidence: [input.operationId],
        reason: 'No durable APM operation journal exists for this verification request.',
      },
    ],
    findings: [],
    followUp: [],
    diagnostics: [],
  };
}

/*** Refuse verified success while the operation journal itself is unfinished or recovery-required. */
function incompleteOperationResult(
  input: ApmVerifyInput,
  journal: NonNullable<Awaited<ReturnType<ApmVerifyPorts['journal']['readAsync']>>>,
): ApmVerifyResult {
  return {
    schemaVersion: 1,
    operation: 'verify',
    operationId: journal.operationId,
    planId: journal.plan.id,
    rootPath: input.rootPath,
    verified: false,
    checks: [
      {
        id: 'operation:completed',
        kind: 'operation',
        status: 'failed',
        evidence: [journal.status],
        reason: 'The reviewed operation has not completed successfully.',
        nextAction: 'Resume or recover the operation before verification.',
      },
    ],
    findings: [],
    followUp: journal.plan.effects,
    diagnostics: [],
  };
}

/*** Explain a local step whose adapter supplied no postcondition evidence. */
function missingStepVerificationCheck(step: ApmPlanStep): ApmVerifyCheckResult {
  return {
    id: `verification-missing:${step.id}`,
    kind: verificationKind(step),
    status: 'unknown',
    evidence: [step.id],
    reason: 'No verification evidence was produced for this reviewed local step.',
    nextAction: 'Run the required owner/package validation and verify the operation again.',
  };
}

/*** Map one reviewed execution step to the owning verification evidence category. */
function verificationKind(step: ApmPlanStep): ApmVerifyCheckKind {
  switch (step.execution.kind) {
    case 'migration':
      return 'migration';
    case 'projection':
      return 'projection';
    case 'validation':
      return 'validation';
    default:
      return 'dependency-state';
  }
}

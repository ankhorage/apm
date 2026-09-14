import type {
  ApmExtensionInvocationResult,
  ApmExtensionProjectWritePort,
  ApmMigrationExecutionInvocation,
  ApmMigrationExecutionResult,
  ApmMigrationPlanResult,
} from '../../../types/update-extension.js';
import type { ApmUpdateProtocolBlocker } from '../../../types/update-validation.js';
import { resolveMigrationExtensionHandler } from '../domain/resolveMigrationExtensionHandler.js';
import { validateMigrationExecutionResult } from '../domain/validateMigrationExecutionResult.js';
import { validateMigrationPlanResult } from '../domain/validateMigrationPlanResult.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';

/*** Invoke one trusted migration executor while exposing only reviewed mutation IDs for writes. */
export async function executeMigrationExtensionAsync(
  input: ApmMigrationExecutionInvocation,
): Promise<ApmExtensionInvocationResult<ApmMigrationExecutionResult>> {
  const reviewed = validateMigrationPlanResult(input.migration, input.plan);
  if (reviewed.plan === undefined) return { ok: false, blockers: reviewed.blockers };
  const resolution = resolveMigrationExtensionHandler(
    input.migration,
    input.context,
    input.extension,
  );
  if (resolution.handler === undefined) return { ok: false, blockers: resolution.blockers };
  try {
    const result: unknown = await resolution.handler.executeAsync({
      descriptor: input.migration,
      context: input.context,
      plan: reviewed.plan,
      project: reviewedProjectPort(reviewed.plan, input.project),
    });
    const validation = validateMigrationExecutionResult(input.migration, reviewed.plan, result);
    return validation.execution === undefined
      ? { ok: false, blockers: validation.blockers }
      : { ok: true, value: validation.execution };
  } catch (error) {
    if (error instanceof UnreviewedMutationError) {
      return {
        ok: false,
        blockers: [unreviewedMutationBlocker(input.migration.id, error.mutationId)],
      };
    }
    throw error;
  }
}

/*** Wrap the host write port so executable owner code can request only mutations in the reviewed plan. */
function reviewedProjectPort(
  plan: ApmMigrationPlanResult,
  project: ApmMigrationExecutionInvocation['project'],
): ApmMigrationExecutionInvocation['project'] {
  const reviewedIds = new Set(plan.mutations.map((mutation) => mutation.id));
  const writePort: ApmExtensionProjectWritePort = {
    applyReviewedMutationAsync: (mutationId) => {
      if (!reviewedIds.has(mutationId))
        return Promise.reject(new UnreviewedMutationError(mutationId));
      return project.applyReviewedMutationAsync(mutationId);
    },
  };
  return {
    readFileAsync: project.readFileAsync,
    listFilesAsync: project.listFilesAsync,
    applyReviewedMutationAsync: writePort.applyReviewedMutationAsync,
  };
}

/*** Mark an executable extension attempt to request a mutation absent from the reviewed plan. */
class UnreviewedMutationError extends Error {
  readonly mutationId: string;

  constructor(mutationId: string) {
    super(`Unreviewed mutation: ${mutationId}`);
    this.mutationId = mutationId;
  }
}

/*** Convert an unreviewed write request into stable protocol blocker evidence. */
function unreviewedMutationBlocker(
  migrationId: string,
  mutationId: string,
): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.extension-result-invalid',
    kind: 'extension',
    id: migrationId,
    evidence: [mutationId],
    reason:
      'Migration extension requested a project mutation that was not present in the reviewed plan.',
  });
}

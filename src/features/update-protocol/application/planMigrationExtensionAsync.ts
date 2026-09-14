import type {
  ApmExtensionInvocationResult,
  ApmMigrationPlanInvocation,
  ApmMigrationPlanResult,
} from '../../../types/update-extension.js';
import { resolveMigrationExtensionHandler } from '../domain/resolveMigrationExtensionHandler.js';
import { validateMigrationPlanResult } from '../domain/validateMigrationPlanResult.js';

/*** Invoke one trusted migration planning handler through a read-only project port. */
export async function planMigrationExtensionAsync(
  input: ApmMigrationPlanInvocation,
): Promise<ApmExtensionInvocationResult<ApmMigrationPlanResult>> {
  const resolution = resolveMigrationExtensionHandler(
    input.migration,
    input.context,
    input.extension,
  );
  if (resolution.handler === undefined) return { ok: false, blockers: resolution.blockers };
  const result: unknown = await resolution.handler.planAsync({
    descriptor: input.migration,
    context: input.context,
    project: input.project,
  });
  const validation = validateMigrationPlanResult(input.migration, result);
  return validation.plan === undefined
    ? { ok: false, blockers: validation.blockers }
    : { ok: true, value: validation.plan };
}

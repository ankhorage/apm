import type { ApmProjectStatusPort } from '../types/status-project.js';
import type { ApmStatusInput, ApmStatusResult } from '../types/status.js';
import { statusProjectAsync } from '../features/status/composition/statusProjectAsync.js';

/*** Inspect project status through a caller-supplied owner-aware port or the canonical generic Node composition. */
export async function inspectProjectStatusAsync(
  input: ApmStatusInput,
  status?: ApmProjectStatusPort,
): Promise<ApmStatusResult> {
  return status === undefined ? statusProjectAsync(input) : status.inspectStatusAsync(input);
}

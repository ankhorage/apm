import { inspectProjectAsync } from '@ankhorage/project-detector/node';

import type { ApmStatusInput, ApmStatusResult } from '../../../types/status.js';
import { statusAsync } from '../application/statusAsync.js';

/*** Compose the headless status use case with Project Detector's published Node inspection edge. */
export async function statusProjectAsync(input: ApmStatusInput): Promise<ApmStatusResult> {
  return statusAsync(input, { inspectProjectAsync });
}

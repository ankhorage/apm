import { readFile } from 'node:fs/promises';

import { isMissingPathError } from '@ankhorage/utility/node/fs';

import type { ApmApplyStepSnapshot } from '../../../../types/apply-storage.js';
import { parseApplyStepSnapshot } from '../../domain/parseApplyStepSnapshot.js';

/*** Read and validate one durable apply snapshot without trusting arbitrary filesystem JSON. */
export async function readApplyStepSnapshotAsync(
  snapshotPath: string,
  stepId: string,
): Promise<ApmApplyStepSnapshot | undefined> {
  try {
    const content = await readFile(snapshotPath, 'utf8');
    const parsedValue: unknown = JSON.parse(content);
    const parsed = parseApplyStepSnapshot(parsedValue);
    return parsed?.stepId === stepId ? parsed : undefined;
  } catch (error) {
    if (isMissingPathError(error) || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

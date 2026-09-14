import { readFile } from 'node:fs/promises';

import { isMissingPathError } from '@ankhorage/utility/node/fs';
import { resolvePathWithinRoot } from '@ankhorage/utility/node/path';

import type { ApmPlanDigestPort } from '../../../../types/plan.js';

/*** Read one project-relative text file and compute the canonical plan digest when it exists. */
export async function readPlanFileStateAsync(
  rootPath: string,
  relativePath: string,
  digest: ApmPlanDigestPort,
): Promise<PlanFileState> {
  const filePath = resolvePathWithinRoot(rootPath, relativePath);
  try {
    const content = await readFile(filePath, 'utf8');
    return { exists: true, content, digest: await digest.digestAsync(content) };
  } catch (error) {
    if (isMissingPathError(error)) return { exists: false };
    throw error;
  }
}

interface PlanFileState {
  readonly exists: boolean;
  readonly content?: string;
  readonly digest?: string;
}

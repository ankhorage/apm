import { writeFile } from 'node:fs/promises';

import { resolvePathWithinRoot } from '@ankhorage/utility/node/path';

import type { ApmPlanStage } from '../../../../types/plan-staging.js';

/*** Restore reviewed manifest content after native resolver-only exact constraints have run. */
export async function restoreStagedPlanManifestExpectationsAsync(
  stage: ApmPlanStage,
  expectations: ReadonlyMap<string, string>,
): Promise<void> {
  await Promise.all(
    [...expectations.entries()].map(([relativePath, content]) =>
      writeFile(resolvePathWithinRoot(stage.rootPath, relativePath), content, 'utf8'),
    ),
  );
}

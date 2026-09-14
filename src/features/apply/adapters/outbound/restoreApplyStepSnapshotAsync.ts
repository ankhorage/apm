import { removeFileWithinRoot, writeFileWithinRoot } from '@ankhorage/utility/node/fs';
import { resolvePathWithinRoot } from '@ankhorage/utility/node/path';

import type { ApmApplyJournal } from '../../../../types/apply.js';
import type { ApmPlanStep } from '../../../../types/plan.js';
import { applySnapshotPath } from '../../utils/applySnapshotPath.js';
import { readApplyStepSnapshotAsync } from './readApplyStepSnapshotAsync.js';

/*** Restore only files captured for one reviewed reversible step without touching unrelated project state. */
export async function restoreApplyStepSnapshotAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
): Promise<readonly string[]> {
  const snapshotPath = applySnapshotPath(journal.rootPath, journal.operationId, step.id);
  const snapshot = await readApplyStepSnapshotAsync(snapshotPath, step.id);
  if (snapshot === undefined)
    throw new Error(`Apply snapshot is unavailable for step '${step.id}'.`);
  await Promise.all(
    snapshot.files.map(async (file) => {
      const filePath = resolvePathWithinRoot(journal.rootPath, file.path);
      if (!file.exists) {
        await removeFileWithinRoot({
          rootPath: journal.rootPath,
          filePath,
          pruneEmptyParents: true,
        });
        return;
      }
      if (file.contentBase64 === undefined) {
        throw new Error(`Apply snapshot content is missing for '${file.path}'.`);
      }
      await writeFileWithinRoot({
        rootPath: journal.rootPath,
        filePath,
        body: Buffer.from(file.contentBase64, 'base64'),
        exclusive: false,
      });
    }),
  );
  return snapshot.files.map(({ path }) => path);
}

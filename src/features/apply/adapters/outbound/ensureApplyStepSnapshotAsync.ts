import { readFile } from 'node:fs/promises';

import { isMissingPathError, pathExists, writeJsonFileAtomic } from '@ankhorage/utility/node/fs';
import { resolvePathWithinRoot } from '@ankhorage/utility/node/path';

import type {
  ApmApplyFileSnapshot,
  ApmApplyStepSnapshot,
} from '../../../../types/apply-storage.js';
import type { ApmApplyJournal } from '../../../../types/apply.js';
import type { ApmPlanStep } from '../../../../types/plan.js';
import { reviewedStepFilePaths } from '../../domain/reviewedStepFilePaths.js';
import { applySnapshotPath } from '../../utils/applySnapshotPath.js';
import { readApplyStepSnapshotAsync } from './readApplyStepSnapshotAsync.js';

/*** Persist one immutable raw-file snapshot before a reversible reviewed step mutates project files. */
export async function ensureApplyStepSnapshotAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
): Promise<ApmApplyStepSnapshot> {
  const snapshotPath = applySnapshotPath(journal.rootPath, journal.operationId, step.id);
  const existing = await readApplyStepSnapshotAsync(snapshotPath, step.id);
  if (existing !== undefined) return existing;
  const files = await Promise.all(
    reviewedStepFilePaths(step).map(async (relativePath): Promise<ApmApplyFileSnapshot> => {
      const filePath = resolvePathWithinRoot(journal.rootPath, relativePath);
      try {
        const content = await readFile(filePath);
        return { path: relativePath, exists: true, contentBase64: content.toString('base64') };
      } catch (error) {
        if (isMissingPathError(error)) return { path: relativePath, exists: false };
        throw error;
      }
    }),
  );
  const snapshot: ApmApplyStepSnapshot = { schemaVersion: 1, stepId: step.id, files };
  if (await pathExists(snapshotPath)) {
    const raced = await readApplyStepSnapshotAsync(snapshotPath, step.id);
    if (raced !== undefined) return raced;
    throw new Error(`Apply snapshot is invalid for reviewed step '${step.id}'.`);
  }
  await writeJsonFileAtomic(snapshotPath, snapshot);
  return snapshot;
}

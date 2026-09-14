import path from 'node:path';

import { applyStatePaths } from './applyStatePaths.js';

/*** Resolve one durable per-step snapshot file below the operation recovery directory. */
export function applySnapshotPath(rootPath: string, operationId: string, stepId: string): string {
  const { snapshotsRoot } = applyStatePaths(rootPath, operationId);
  if (snapshotsRoot === undefined) throw new Error('Operation snapshot root is unavailable.');
  return path.join(snapshotsRoot, `${encodeURIComponent(stepId)}.json`);
}

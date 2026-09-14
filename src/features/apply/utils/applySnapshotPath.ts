import path from 'node:path';

import { applyStatePaths } from './applyStatePaths.js';

/*** Resolve one durable per-step snapshot file below the operation recovery directory. */
export function applySnapshotPath(rootPath: string, operationId: string, stepId: string): string {
  const { snapshotsRoot } = applyStatePaths(rootPath, operationId);
  return path.join(snapshotsRoot, `${encodeURIComponent(stepId)}.json`);
}

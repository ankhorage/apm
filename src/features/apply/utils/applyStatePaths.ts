import path from 'node:path';

/*** Resolve all APM-owned durable operation paths below one project root. */
export function applyStatePaths(rootPath: string, operationId?: string): ApplyStatePaths {
  const apmRoot = path.join(path.resolve(rootPath), '.apm');
  const operationsRoot = path.join(apmRoot, 'operations');
  return {
    apmRoot,
    operationsRoot,
    lockPath: path.join(apmRoot, 'operation.lock'),
    ...(operationId === undefined
      ? {}
      : {
          operationRoot: path.join(operationsRoot, operationId),
          journalPath: path.join(operationsRoot, operationId, 'journal.json'),
          snapshotsRoot: path.join(operationsRoot, operationId, 'snapshots'),
        }),
  };
}

interface ApplyStatePaths {
  readonly apmRoot: string;
  readonly operationsRoot: string;
  readonly lockPath: string;
  readonly operationRoot?: string;
  readonly journalPath?: string;
  readonly snapshotsRoot?: string;
}

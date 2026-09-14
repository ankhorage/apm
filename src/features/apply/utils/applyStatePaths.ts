import path from 'node:path';

export function applyStatePaths(rootPath: string): ApplyStatePaths;
export function applyStatePaths(rootPath: string, operationId: string): ApplyOperationPaths;

/*** Resolve all APM-owned durable operation paths below one project root. */
export function applyStatePaths(
  rootPath: string,
  operationId?: string,
): ApplyStatePaths | ApplyOperationPaths {
  const apmRoot = path.join(path.resolve(rootPath), '.apm');
  const operationsRoot = path.join(apmRoot, 'operations');
  const base = {
    apmRoot,
    operationsRoot,
    lockPath: path.join(apmRoot, 'operation.lock'),
  };
  return operationId === undefined
    ? base
    : {
        ...base,
        operationRoot: path.join(operationsRoot, operationId),
        journalPath: path.join(operationsRoot, operationId, 'journal.json'),
        snapshotsRoot: path.join(operationsRoot, operationId, 'snapshots'),
      };
}

interface ApplyStatePaths {
  readonly apmRoot: string;
  readonly operationsRoot: string;
  readonly lockPath: string;
}

interface ApplyOperationPaths extends ApplyStatePaths {
  readonly operationRoot: string;
  readonly journalPath: string;
  readonly snapshotsRoot: string;
}

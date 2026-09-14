import { readFile } from 'node:fs/promises';
import { hostname } from 'node:os';

import {
  isMissingPathError,
  removeFileWithinRoot,
  writeFileWithinRoot,
} from '@ankhorage/utility/node/fs';
import { isRecord } from '@ankhorage/utility/object';

import type {
  ApmApplyLockAcquireResult,
  ApmApplyLockIdentity,
  ApmApplyLockPort,
} from '../../../../types/apply.js';
import { applyStatePaths } from '../../utils/applyStatePaths.js';

/*** Create the Node project-writer lock adapter with conservative same-host stale recovery. */
export function createNodeApplyLockPort(): ApmApplyLockPort {
  const ownedLocks = new Map<string, ApmApplyLockIdentity>();
  return {
    acquireAsync: (input) => acquireAsync(input, ownedLocks),
    recoverStaleAsync: (input) => recoverStaleAsync(input, ownedLocks),
    releaseAsync: (rootPath, operationId) => releaseOwnedAsync(rootPath, operationId, ownedLocks),
  };
}

type AcquireInput = Parameters<ApmApplyLockPort['acquireAsync']>[0];
type RecoverInput = Parameters<ApmApplyLockPort['recoverStaleAsync']>[0];

/*** Acquire one exclusive lock or report the existing writer with proven stale/live classification. */
async function acquireAsync(
  input: AcquireInput,
  ownedLocks: Map<string, ApmApplyLockIdentity>,
): Promise<ApmApplyLockAcquireResult> {
  const lock = createLockIdentity(input.operationId, input.planId);
  const { lockPath } = applyStatePaths(input.rootPath);
  try {
    await writeFileWithinRoot({
      rootPath: input.rootPath,
      filePath: lockPath,
      body: new TextEncoder().encode(`${JSON.stringify(lock, null, 2)}\n`),
    });
    ownedLocks.set(lockPath, lock);
    return { state: 'acquired', lock };
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
    return classifyExistingLockAsync(input.rootPath);
  }
}

/*** Replace only the exact stale lock previously reported for the same resumable operation. */
async function recoverStaleAsync(
  input: RecoverInput,
  ownedLocks: Map<string, ApmApplyLockIdentity>,
): Promise<ApmApplyLockAcquireResult> {
  const current = await readLockAsync(input.rootPath);
  if (current === undefined || !sameLock(current, input.stale)) {
    return conflictResult(
      current ?? input.stale,
      'Operation lock changed while stale-lock recovery was being prepared.',
    );
  }
  if (!isStaleSameHostLock(current)) {
    return conflictResult(current, 'Operation lock is no longer provably stale on this host.');
  }
  const { lockPath } = applyStatePaths(input.rootPath);
  await removeFileWithinRoot({ rootPath: input.rootPath, filePath: lockPath });
  return acquireAsync(
    {
      rootPath: input.rootPath,
      operationId: input.operationId,
      planId: input.planId,
      resume: true,
    },
    ownedLocks,
  );
}

/*** Release only the exact lock identity acquired by this adapter instance/process. */
async function releaseOwnedAsync(
  rootPath: string,
  operationId: string,
  ownedLocks: Map<string, ApmApplyLockIdentity>,
): Promise<void> {
  const { lockPath } = applyStatePaths(rootPath);
  const owned = ownedLocks.get(lockPath);
  if (owned === undefined || owned.operationId !== operationId) return;
  const current = await readLockAsync(rootPath);
  if (current !== undefined && sameLock(current, owned)) {
    await removeFileWithinRoot({ rootPath, filePath: lockPath });
  }
  ownedLocks.delete(lockPath);
}

/*** Read and classify the current lock without using age-based stale heuristics. */
async function classifyExistingLockAsync(rootPath: string): Promise<ApmApplyLockAcquireResult> {
  const existing = await readLockAsync(rootPath);
  if (existing === undefined) {
    const placeholder = createLockIdentity('unknown', 'unknown');
    return conflictResult(
      placeholder,
      'Operation lock exists but its identity could not be read safely.',
    );
  }
  return isStaleSameHostLock(existing)
    ? {
        state: 'stale',
        lock: existing,
        reason: 'Recorded operation process no longer exists on this host.',
      }
    : conflictResult(existing, 'Another operation owns the project writer lock.');
}

/*** Read one lock JSON document and reject malformed lock state conservatively. */
async function readLockAsync(rootPath: string): Promise<ApmApplyLockIdentity | undefined> {
  const { lockPath } = applyStatePaths(rootPath);
  try {
    const content = await readFile(lockPath, 'utf8');
    const parsed: unknown = JSON.parse(content);
    return isLockIdentity(parsed) ? parsed : undefined;
  } catch (error) {
    if (isMissingPathError(error) || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

/*** Build lock identity from concrete Node process/host boundary evidence. */
function createLockIdentity(operationId: string, planId: string): ApmApplyLockIdentity {
  return {
    schemaVersion: 1,
    operationId,
    planId,
    pid: process.pid,
    hostname: hostname(),
    acquiredAt: new Date().toISOString(),
  };
}

/*** Treat a lock as stale only when it is local and its recorded process definitely does not exist. */
function isStaleSameHostLock(lock: ApmApplyLockIdentity): boolean {
  return lock.hostname === hostname() && !processExists(lock.pid);
}

/*** Probe one local PID without signalling or terminating it. */
function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(isRecord(error) && error.code === 'ESRCH');
  }
}

/*** Validate serialized lock identity before it can influence recovery decisions. */
function isLockIdentity(value: unknown): value is ApmApplyLockIdentity {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.operationId === 'string' &&
    typeof value.planId === 'string' &&
    typeof value.pid === 'number' &&
    Number.isInteger(value.pid) &&
    value.pid > 0 &&
    typeof value.hostname === 'string' &&
    typeof value.acquiredAt === 'string'
  );
}

/*** Compare full immutable lock identity to avoid deleting a successor lock. */
function sameLock(left: ApmApplyLockIdentity, right: ApmApplyLockIdentity): boolean {
  return (
    left.operationId === right.operationId &&
    left.planId === right.planId &&
    left.pid === right.pid &&
    left.hostname === right.hostname &&
    left.acquiredAt === right.acquiredAt
  );
}

/*** Identify the only expected exclusive-create collision. */
function isAlreadyExistsError(error: unknown): boolean {
  return isRecord(error) && error.code === 'EEXIST';
}

/*** Build a stable lock conflict result. */
function conflictResult(lock: ApmApplyLockIdentity, reason: string): ApmApplyLockAcquireResult {
  return { state: 'conflict', lock, reason };
}

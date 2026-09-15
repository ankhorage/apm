import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { createNodeApplyLockPort } from './nodeApm.js';

type NodeApplyLockPort = ReturnType<typeof createNodeApplyLockPort>;

test('public Node facade serializes cooperative project writers through the APM apply lock', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-cooperative-lock-test-'));
  const firstWriter = createNodeApplyLockPort();
  const secondWriter = createNodeApplyLockPort();
  const observer = createNodeApplyLockPort();

  try {
    const firstAcquire = await acquireAsync(firstWriter, rootPath, 'studio-writer-1', 'host-1');
    expect(firstAcquire.state).toBe('acquired');

    const competingAcquire = await acquireAsync(secondWriter, rootPath, 'apm-apply-1', 'plan-1');
    expect(competingAcquire.state).toBe('conflict');
    expect(competingAcquire.lock.operationId).toBe('studio-writer-1');

    await secondWriter.releaseAsync(rootPath, 'studio-writer-1');
    const stillLocked = await acquireAsync(observer, rootPath, 'observer-1', 'observer-plan-1');
    expect(stillLocked.state).toBe('conflict');
    expect(stillLocked.lock.operationId).toBe('studio-writer-1');

    await firstWriter.releaseAsync(rootPath, 'studio-writer-1');
    const successorAcquire = await acquireAsync(secondWriter, rootPath, 'apm-apply-1', 'plan-1');
    expect(successorAcquire.state).toBe('acquired');

    await firstWriter.releaseAsync(rootPath, 'studio-writer-1');
    const successorStillLocked = await acquireAsync(
      observer,
      rootPath,
      'observer-2',
      'observer-plan-2',
    );
    expect(successorStillLocked.state).toBe('conflict');
    expect(successorStillLocked.lock.operationId).toBe('apm-apply-1');
  } finally {
    await firstWriter.releaseAsync(rootPath, 'studio-writer-1');
    await secondWriter.releaseAsync(rootPath, 'apm-apply-1');
    await observer.releaseAsync(rootPath, 'observer-1');
    await observer.releaseAsync(rootPath, 'observer-2');
    await rm(rootPath, { recursive: true, force: true });
  }
});

/*** Acquire the public Node writer lock with one concise fixture identity. */
function acquireAsync(
  port: NodeApplyLockPort,
  rootPath: string,
  operationId: string,
  planId: string,
) {
  return port.acquireAsync({ rootPath, operationId, planId, resume: false });
}

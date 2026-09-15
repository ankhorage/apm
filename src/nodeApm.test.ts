import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { createNodeApplyLockPort } from './nodeApm.js';

test('public Node facade serializes cooperative project writers through the APM apply lock', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-cooperative-lock-test-'));
  const firstWriter = createNodeApplyLockPort();
  const secondWriter = createNodeApplyLockPort();
  const observer = createNodeApplyLockPort();

  try {
    const firstAcquire = await firstWriter.acquireAsync({
      rootPath,
      operationId: 'studio-writer-1',
      planId: 'studio-host-write-1',
      resume: false,
    });
    expect(firstAcquire.state).toBe('acquired');

    const competingAcquire = await secondWriter.acquireAsync({
      rootPath,
      operationId: 'apm-apply-1',
      planId: 'apm-plan-1',
      resume: false,
    });
    expect(competingAcquire.state).toBe('conflict');
    expect(competingAcquire.lock.operationId).toBe('studio-writer-1');

    await secondWriter.releaseAsync(rootPath, 'studio-writer-1');
    const stillLocked = await observer.acquireAsync({
      rootPath,
      operationId: 'observer-1',
      planId: 'observer-plan-1',
      resume: false,
    });
    expect(stillLocked.state).toBe('conflict');
    expect(stillLocked.lock.operationId).toBe('studio-writer-1');

    await firstWriter.releaseAsync(rootPath, 'studio-writer-1');
    const successorAcquire = await secondWriter.acquireAsync({
      rootPath,
      operationId: 'apm-apply-1',
      planId: 'apm-plan-1',
      resume: false,
    });
    expect(successorAcquire.state).toBe('acquired');

    await firstWriter.releaseAsync(rootPath, 'studio-writer-1');
    const successorStillLocked = await observer.acquireAsync({
      rootPath,
      operationId: 'observer-2',
      planId: 'observer-plan-2',
      resume: false,
    });
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

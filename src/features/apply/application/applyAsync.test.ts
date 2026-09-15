import { expect, test } from 'bun:test';

import { applyAsync } from './applyAsync.js';
import { createApplyFixture } from './fixtures/createApplyFixture.test.js';

test('stale plan blocks before creating a journal or executing project effects', async () => {
  const fixture = createApplyFixture();
  fixture.state.planValidationBlockers = [
    {
      code: 'plan.input-changed',
      scope: { kind: 'project' },
      evidence: ['old', 'new'],
      reason: 'Planning evidence changed.',
    },
  ];

  const result = await applyAsync(
    { mode: 'start', plan: fixture.plan, permissions: fixture.permissions },
    fixture.ports,
  );

  expect(result.status).toBe('blocked');
  expect(result.blockers.map(({ code }) => code)).toEqual(['apply.plan-stale']);
  expect(fixture.state.createdJournals).toBe(0);
  expect(fixture.state.executeCalls).toBe(0);
});

test('concurrent apply is rejected by the exclusive operation lock', async () => {
  const fixture = createApplyFixture();
  fixture.state.lockResult = {
    state: 'conflict',
    lock: fixture.createLockIdentity('existing-op'),
    reason: 'Another live APM operation owns this project.',
  };

  const result = await applyAsync(
    { mode: 'start', plan: fixture.plan, permissions: fixture.permissions },
    fixture.ports,
  );

  expect(result.status).toBe('blocked');
  expect(result.blockers.map(({ code }) => code)).toEqual(['apply.lock-conflict']);
  expect(fixture.state.createdJournals).toBe(0);
  expect(fixture.state.executeCalls).toBe(0);
});

test('duplicate resume of a completed operation is idempotent and does not acquire or execute again', async () => {
  const fixture = createApplyFixture();
  const journal = fixture.completedJournal;
  fixture.state.journal = journal;

  const result = await applyAsync(
    {
      mode: 'resume',
      rootPath: journal.rootPath,
      operationId: journal.operationId,
      permissions: fixture.permissions,
    },
    fixture.ports,
  );

  expect(result.status).toBe('completed');
  expect(result.complete).toBe(true);
  expect(fixture.state.lockCalls).toBe(0);
  expect(fixture.state.executeCalls).toBe(0);
});

test('lost process resumes an already satisfied started effect without repeating execution', async () => {
  const fixture = createApplyFixture();
  const journal = fixture.startedJournal;
  fixture.state.journal = journal;
  fixture.state.lockResult = {
    state: 'stale',
    lock: fixture.createLockIdentity(journal.operationId, journal.plan.id),
    reason: 'Recorded process no longer exists on this host.',
  };
  fixture.state.recoveredLockResult = {
    state: 'acquired',
    lock: fixture.createLockIdentity(journal.operationId, journal.plan.id),
  };
  fixture.state.observation = { state: 'satisfied', evidence: ['digest:after'] };

  const result = await applyAsync(
    {
      mode: 'resume',
      rootPath: journal.rootPath,
      operationId: journal.operationId,
      permissions: fixture.permissions,
    },
    fixture.ports,
  );

  expect(result.status).toBe('completed');
  expect(fixture.state.recoverCalls).toBe(1);
  expect(fixture.state.executeCalls).toBe(0);
  expect(result.journal?.steps[0]).toMatchObject({ state: 'committed', attempts: 1 });
});

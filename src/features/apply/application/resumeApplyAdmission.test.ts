import { expect, test } from 'bun:test';

import type { ApmApplyJournal } from '../../../types/apply.js';
import { createApplyFixture } from './fixtures/createApplyFixture.test.js';

test('resume blocks when the durable journal disappears before the lock is acquired', async () => {
  const fixture = createApplyFixture();
  const initial = fixture.startedJournal;

  const result = await fixture.resumeAfterAcquisitionAsync(initial, () => {
    delete fixture.state.journal;
  });

  expect(result.status).toBe('blocked');
  expect(result.blockers.map(({ code }) => code)).toEqual(['apply.operation-not-found']);
  expect(fixture.state.journal).toBeUndefined();
  expect(fixture.state.writtenJournals).toBe(0);
  expect(fixture.state.executeCalls).toBe(0);
  expect(fixture.state.releaseCalls).toBe(1);
});

test('resume does not apply a replacement plan under a lock acquired for the previous plan', async () => {
  const fixture = createApplyFixture();
  const initial = fixture.startedJournal;
  const replacement = { ...initial, plan: { ...initial.plan, id: 'different-plan' } };

  const result = await fixture.resumeAfterAcquisitionAsync(initial, () => {
    fixture.state.journal = replacement;
  });

  expect(result.status).toBe('blocked');
  expect(result.blockers.map(({ code }) => code)).toEqual(['apply.journal-invalid']);
  expect(fixture.state.journal).toBe(replacement);
  expect(fixture.state.writtenJournals).toBe(0);
  expect(fixture.state.executeCalls).toBe(0);
  expect(fixture.state.releaseCalls).toBe(1);
});

test.each([
  {
    name: 'operation',
    change: (journal: ApmApplyJournal) => ({ ...journal, operationId: 'different-operation' }),
  },
  {
    name: 'journal root',
    change: (journal: ApmApplyJournal) => ({ ...journal, rootPath: '/different-project' }),
  },
  {
    name: 'plan root',
    change: (journal: ApmApplyJournal) => ({
      ...journal,
      plan: { ...journal.plan, rootPath: '/different-project' },
    }),
  },
])('resume rejects changed $name identity after acquiring the lock', async ({ change }) => {
  const fixture = createApplyFixture();
  const initial = fixture.startedJournal;
  const replacement = change(initial);

  const result = await fixture.resumeAfterAcquisitionAsync(initial, () => {
    fixture.state.journal = replacement;
  });

  expect(result.status).toBe('blocked');
  expect(result.blockers.map(({ code }) => code)).toEqual(['apply.journal-invalid']);
  expect(fixture.state.journal).toBe(replacement);
  expect(fixture.state.writtenJournals).toBe(0);
  expect(fixture.state.executeCalls).toBe(0);
  expect(fixture.state.releaseCalls).toBe(1);
});

test('resume revalidates executor compatibility from the authoritative journal', async () => {
  const fixture = createApplyFixture();
  const initial = fixture.startedJournal;
  const replacement: ApmApplyJournal = {
    ...initial,
    plan: { ...initial.plan, executor: { ...initial.plan.executor, runtime: 'other' } },
  };

  const result = await fixture.resumeAfterAcquisitionAsync(initial, () => {
    fixture.state.journal = replacement;
  });

  expect(result.status).toBe('blocked');
  expect(result.blockers.map(({ code }) => code)).toEqual(['apply.executor-incompatible']);
  expect(fixture.state.journal).toBe(replacement);
  expect(fixture.state.writtenJournals).toBe(0);
  expect(fixture.state.executeCalls).toBe(0);
  expect(fixture.state.releaseCalls).toBe(1);
});

test('resume revalidates plan completeness from the authoritative journal', async () => {
  const fixture = createApplyFixture();
  const initial = fixture.startedJournal;
  const replacement: ApmApplyJournal = { ...initial, plan: { ...initial.plan, complete: false } };

  const result = await fixture.resumeAfterAcquisitionAsync(initial, () => {
    fixture.state.journal = replacement;
  });

  expect(result.status).toBe('blocked');
  expect(result.blockers.map(({ code }) => code)).toEqual(['apply.plan-incomplete']);
  expect(fixture.state.journal).toBe(replacement);
  expect(fixture.state.writtenJournals).toBe(0);
  expect(fixture.state.executeCalls).toBe(0);
  expect(fixture.state.releaseCalls).toBe(1);
});

test('resume does not reuse stale permission findings before running the current journal', async () => {
  const fixture = createApplyFixture();
  const initial = fixture.startedJournal;
  const replacement: ApmApplyJournal = {
    ...initial,
    plan: {
      ...initial.plan,
      steps: [
        {
          ...fixture.step,
          kind: 'install',
          execution: {
            kind: 'install',
            installRootPath: initial.rootPath,
            manager: 'npm',
            packageIds: [],
            lifecycleScripts: true,
          },
        },
      ],
    },
  };

  const result = await fixture.resumeAfterAcquisitionAsync(initial, () => {
    fixture.state.journal = replacement;
  });

  expect(result.status).toBe('blocked');
  expect(result.blockers.map(({ code }) => code)).toEqual(['apply.permission-required']);
  expect(result.blockers[0]?.evidence).toEqual(['lifecycle-scripts']);
  expect(fixture.state.journal).toBe(replacement);
  expect(fixture.state.writtenJournals).toBe(0);
  expect(fixture.state.executeCalls).toBe(0);
  expect(fixture.state.releaseCalls).toBe(1);
});

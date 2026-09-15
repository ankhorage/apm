import { expect, test } from 'bun:test';

import type { ApmApplyJournal, ApmApplyPorts } from '../../../types/apply.js';
import type { ApmPlanStep } from '../../../types/plan.js';
import { createApplyJournal } from '../domain/createApplyJournal.js';
import { applyAsync } from './applyAsync.js';
import { createApplyFixture } from './fixtures/createApplyFixture.test.js';

test('resume preserves a completion committed between the first read and lock acquisition', async () => {
  const fixture = createApplyFixture();
  const initial = fixture.startedJournal;
  const completed: ApmApplyJournal = {
    ...initial,
    status: 'completed',
    updatedAt: '2026-09-14T19:30:00.000Z',
    steps: initial.steps.map((step) => ({ ...step, state: 'committed', attempts: 3 })),
  };

  const result = await fixture.resumeAfterAcquisitionAsync(initial, () => {
    fixture.state.journal = completed;
  });

  expect(result.status).toBe('completed');
  expect(result.journal).toBe(completed);
  expect(fixture.state.journal).toBe(completed);
  expect(fixture.state.writtenJournals).toBe(0);
  expect(fixture.state.observedStepIds).toEqual([]);
  expect(fixture.state.executeCalls).toBe(0);
  expect(fixture.state.releaseCalls).toBe(1);
});

test('resume releases its lock if the authoritative journal read fails', async () => {
  const fixture = createApplyFixture();
  const initial = fixture.startedJournal;
  fixture.state.journal = initial;
  const readError = new Error('Durable journal became unreadable.');
  const ports: ApmApplyPorts = {
    ...fixture.ports,
    journal: {
      ...fixture.ports.journal,
      readAsync: () =>
        fixture.state.lockCalls === 0 ? Promise.resolve(initial) : Promise.reject(readError),
    },
  };

  const result = await applyAsync(
    {
      mode: 'resume',
      rootPath: initial.rootPath,
      operationId: initial.operationId,
      permissions: fixture.permissions,
    },
    ports,
  ).catch((error: unknown) => error);
  expect(result).toBe(readError);
  expect(fixture.state.writtenJournals).toBe(0);
  expect(fixture.state.executeCalls).toBe(0);
  expect(fixture.state.releaseCalls).toBe(1);
});

test('resume keeps committed step progress and executes only the remaining reviewed work', async () => {
  const fixture = createApplyFixture();
  const first = fixture.step;
  const validation: ApmPlanStep = {
    id: 'validate:root',
    kind: 'validation',
    prerequisites: [first.id],
    reason: 'Validate the updated project.',
    evidence: [],
    execution: { kind: 'validation', checks: [{ id: 'dependencies', kind: 'dependency-state' }] },
  };
  const initial = createApplyJournal(
    { ...fixture.plan, steps: [first, validation] },
    fixture.permissions,
    'op-progress',
    '2026-09-14T19:00:00.000Z',
  );
  const advanced: ApmApplyJournal = {
    ...initial,
    steps: initial.steps.map((step) =>
      step.stepId === first.id
        ? { ...step, state: 'committed', attempts: 2, evidence: ['earlier-writer'] }
        : step,
    ),
  };

  const result = await fixture.resumeAfterAcquisitionAsync(initial, () => {
    fixture.state.journal = advanced;
  });

  expect(result.status).toBe('completed');
  expect(result.journal?.steps[0]).toEqual(advanced.steps[0]);
  expect(result.journal?.steps[1]).toMatchObject({ state: 'committed', attempts: 1 });
  expect(fixture.state.observedStepIds).toEqual([validation.id]);
  expect(fixture.state.executedStepIds).toEqual([validation.id]);
  expect(fixture.state.releaseCalls).toBe(1);
});

test('resume also reloads completion after conservative stale-lock recovery', async () => {
  const fixture = createApplyFixture();
  const initial = fixture.startedJournal;
  const completed: ApmApplyJournal = {
    ...initial,
    status: 'completed',
    steps: initial.steps.map((step) => ({ ...step, state: 'committed' })),
  };
  fixture.state.journal = initial;
  fixture.state.lockResult = {
    state: 'stale',
    lock: fixture.createLockIdentity(initial.operationId, initial.plan.id),
    reason: 'Previous process exited.',
  };
  const ports: ApmApplyPorts = {
    ...fixture.ports,
    lock: {
      ...fixture.ports.lock,
      recoverStaleAsync: async (input) => {
        const acquired = await fixture.ports.lock.recoverStaleAsync(input);
        fixture.state.journal = completed;
        return acquired;
      },
    },
  };

  const result = await applyAsync(
    {
      mode: 'resume',
      rootPath: initial.rootPath,
      operationId: initial.operationId,
      permissions: fixture.permissions,
    },
    ports,
  );

  expect(result.journal).toBe(completed);
  expect(fixture.state.recoverCalls).toBe(1);
  expect(fixture.state.writtenJournals).toBe(0);
  expect(fixture.state.observedStepIds).toEqual([]);
  expect(fixture.state.executeCalls).toBe(0);
  expect(fixture.state.releaseCalls).toBe(1);
});

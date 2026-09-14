import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import type { ApmApplyJournal, ApmApplyPorts } from '../../../types/apply.js';
import type { ApmPlanResult } from '../../../types/plan.js';
import type { ApmStatusResult } from '../../../types/status.js';
import { createSha256PlanDigestPort } from '../../plan/adapters/outbound/createSha256PlanDigestPort.js';
import { createNodeApplyStepPort } from '../adapters/outbound/createNodeApplyStepPort.js';
import { createApplyJournal } from '../domain/createApplyJournal.js';
import { runApplyStepsAsync } from './runApplyStepsAsync.js';

const PERMISSIONS = { ownerCode: false, lifecycleScripts: false, externalEffects: false } as const;

test('failed frozen install preserves unrelated files and leaves durable failure state', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-install-failure-'));
  const unrelatedPath = path.join(rootPath, 'notes.txt');
  try {
    await writeFile(path.join(rootPath, 'package.json'), JSON.stringify({ name: 'fixture' }));
    await writeFile(unrelatedPath, 'keep-me');
    const plan = installPlan(rootPath);
    const state = { journal: createApplyJournal(plan, PERMISSIONS, 'install-failure', now()) };
    const outcome = await runApplyStepsAsync(state.journal, applyPorts(state));

    expect(outcome.status).toBe('failed');
    expect(outcome.journal.status).toBe('failed');
    expect(outcome.journal.failure?.code).toBe('apply.install-failed');
    expect(await readFile(unrelatedPath, 'utf8')).toBe('keep-me');
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

interface InstallFailureState {
  journal: ApmApplyJournal;
}

/*** Compose real Node install execution with in-memory journal persistence. */
function applyPorts(state: InstallFailureState): ApmApplyPorts {
  return {
    clock: { nowIso: now },
    operationId: { createOperationId: () => 'unused' },
    lock: inertLockPort(),
    journal: {
      createAsync: (journal) => updateJournal(state, journal),
      readAsync: () => Promise.resolve(state.journal),
      writeAsync: (journal) => updateJournal(state, journal),
    },
    status: { inspectStatusAsync: (rootPath) => Promise.resolve(statusFixture(rootPath)) },
    planValidation: { validateAsync: () => Promise.resolve([]) },
    executor: { current: () => installPlan(state.journal.rootPath).executor },
    step: createNodeApplyStepPort({ digest: createSha256PlanDigestPort() }),
  };
}

/*** Persist one in-memory journal update. */
function updateJournal(state: InstallFailureState, journal: ApmApplyJournal): Promise<void> {
  state.journal = journal;
  return Promise.resolve();
}

/*** Build one frozen npm install that must fail because the fixture has no package-lock. */
function installPlan(rootPath: string): ApmPlanResult {
  return {
    schemaVersion: 2,
    operation: 'plan',
    id: 'install-failure-plan',
    rootPath,
    complete: true,
    policy: {
      dependencyUpdates: 'none',
      selections: [],
      repairInstallations: true,
      repairProjections: true,
      maxGeneratorIterations: 4,
    },
    executor: { apmVersion: '0.4.0', runtime: 'node', runtimeVersion: process.versions.node },
    inputFingerprint: { value: 'fixture', statusSchemaVersion: 2, availabilityCheckedAt: [] },
    targets: [],
    files: [],
    packages: [],
    artifacts: [],
    steps: [
      {
        id: 'install:root',
        kind: 'install',
        prerequisites: [],
        installRootId: '.',
        reason: 'Exercise frozen install failure recovery.',
        evidence: [],
        execution: {
          kind: 'install',
          installRootPath: rootPath,
          manager: 'npm',
          packageIds: [],
          lifecycleScripts: false,
        },
      },
    ],
    effects: [],
    findings: [],
    blockers: [],
    diagnostics: [],
  };
}

/*** Build neutral complete status required by the unused start-validation port. */
function statusFixture(rootPath: string): ApmStatusResult {
  return {
    schemaVersion: 2,
    operation: 'status',
    rootPath,
    complete: true,
    currency: 'current',
    project: {
      traits: [],
      languages: [],
      packageManagers: ['npm'],
      buildTools: [],
      packageCount: 1,
      workspaceCount: 0,
    },
    installRoots: [],
    dependencies: [],
    hosts: [],
    extensions: { state: 'unavailable', complete: true, observations: [], diagnostics: [] },
    findings: [],
    diagnostics: [],
  };
}

/*** Build unused lock methods for direct state-machine execution. */
function inertLockPort(): ApmApplyPorts['lock'] {
  const lock = {
    schemaVersion: 1 as const,
    operationId: 'install-failure',
    planId: 'install-failure-plan',
    pid: 1,
    hostname: 'fixture',
    acquiredAt: now(),
  };
  return {
    acquireAsync: () => Promise.resolve({ state: 'acquired', lock }),
    recoverStaleAsync: () => Promise.resolve({ state: 'acquired', lock }),
    releaseAsync: () => Promise.resolve(),
  };
}

/*** Return a stable timestamp for deterministic journal fixtures. */
function now(): string {
  return '2026-09-14T21:10:00.000Z';
}

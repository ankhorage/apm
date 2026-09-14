import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import type { ApmApplyJournal, ApmApplyPorts, ApmApplyStepPort } from '../../../types/apply.js';
import type { ApmPlanStep, ApmPlanStepExecution } from '../../../types/plan.js';
import type { ApmMigrationDescriptor } from '../../../types/update-protocol.js';
import { createSha256PlanDigestPort } from '../../plan/adapters/outbound/createSha256PlanDigestPort.js';
import { planExecutionFixtures } from '../../plan/application/fixtures/planExecutionFixtures.js';
import { createNodeApplyStepPort } from '../adapters/outbound/createNodeApplyStepPort.js';
import { createApplyJournal } from '../domain/createApplyJournal.js';
import { runApplyStepsAsync } from './runApplyStepsAsync.js';

const PERMISSIONS = { ownerCode: true, lifecycleScripts: false, externalEffects: false } as const;

test('migration failure restores owned files and preserves unrelated project files', async () => {
  await runOwnerFailureCase('migration');
});

test('projection failure restores owned files and preserves unrelated project files', async () => {
  await runOwnerFailureCase('projection');
});

/*** Exercise one package-owner failure after mutation and prove snapshot rollback stays scope-local. */
async function runOwnerFailureCase(kind: 'migration' | 'projection'): Promise<void> {
  const rootPath = await mkdtemp(path.join(tmpdir(), `apm-${kind}-failure-`));
  const ownedPath = path.join(rootPath, 'owned.json');
  const unrelatedPath = path.join(rootPath, 'notes.txt');
  try {
    await writeFile(ownedPath, 'before');
    await writeFile(unrelatedPath, 'keep-me');
    const plan = ownerFailurePlan(rootPath, kind);
    const state = { journal: createApplyJournal(plan, PERMISSIONS, `${kind}-failure`, now()) };
    const outcome = await runApplyStepsAsync(state.journal, applyPorts(state, ownerPort(rootPath)));

    expect(outcome.status).toBe('failed');
    expect(await readFile(ownedPath, 'utf8')).toBe('before');
    expect(await readFile(unrelatedPath, 'utf8')).toBe('keep-me');
    expect(outcome.journal.failure?.code).toBe(`fixture.${kind}-failed`);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
}

interface OwnerFailureState {
  journal: ApmApplyJournal;
}

/*** Compose the real Node snapshot/rollback wrapper around one deliberately failing owner port. */
function applyPorts(state: OwnerFailureState, owner: ApmApplyStepPort): ApmApplyPorts {
  return {
    clock: { nowIso: now },
    operationId: { createOperationId: () => 'unused' },
    lock: inertLockPort(state.journal.operationId, state.journal.plan.id),
    journal: {
      createAsync: (journal) => updateJournal(state, journal),
      readAsync: () => Promise.resolve(state.journal),
      writeAsync: (journal) => updateJournal(state, journal),
    },
    status: { inspectStatusAsync: () => Promise.reject(new Error('unused status port')) },
    planValidation: { validateAsync: () => Promise.resolve([]) },
    executor: { current: () => state.journal.plan.executor },
    step: createNodeApplyStepPort({ digest: createSha256PlanDigestPort(), owner }),
  };
}

/*** Simulate package-owner code that mutates its reviewed scope before returning a known failure. */
function ownerPort(rootPath: string): ApmApplyStepPort {
  return {
    observeAsync: () => Promise.resolve({ state: 'pending', evidence: [] }),
    executeAsync: async ({ step }) => {
      await writeFile(path.join(rootPath, 'owned.json'), 'broken');
      return {
        state: 'failed',
        evidence: [step.id],
        diagnostics: [],
        failure: {
          code: `fixture.${step.execution.kind}-failed`,
          reason: 'Injected owner failure after the reviewed local mutation.',
          evidence: [step.id],
        },
      };
    },
    rollbackAsync: () =>
      Promise.resolve({ state: 'completed', evidence: ['owner-rollback'], diagnostics: [] }),
  };
}

/*** Build a one-step owner plan whose local file scope is explicitly reversible. */
function ownerFailurePlan(rootPath: string, kind: 'migration' | 'projection') {
  const execution = kind === 'migration' ? migrationExecution() : projectionExecution();
  const step: ApmPlanStep = {
    id: `${kind}:@owner/package:fixture`,
    kind,
    prerequisites: [],
    owner: '@owner/package',
    reason: 'Inject owner failure after mutation.',
    evidence: ['owned.json'],
    execution,
  };
  return {
    schemaVersion: 2 as const,
    operation: 'plan' as const,
    id: `${kind}-failure-plan`,
    rootPath,
    complete: true,
    policy: {
      dependencyUpdates: 'none' as const,
      selections: [],
      repairInstallations: true,
      repairProjections: true,
      maxGeneratorIterations: 4,
    },
    executor: {
      apmVersion: '0.4.0',
      runtime: 'node' as const,
      runtimeVersion: process.versions.node,
    },
    inputFingerprint: { value: 'fixture', statusSchemaVersion: 2, availabilityCheckedAt: [] },
    targets: [],
    files: [],
    packages: [],
    artifacts: [],
    steps: [step],
    effects: [],
    findings: [],
    blockers: [],
    diagnostics: [],
  };
}

/*** Build one reversible migration with an exact reviewed local write mutation. */
function migrationExecution(): Extract<ApmPlanStepExecution, { readonly kind: 'migration' }> {
  const descriptor: ApmMigrationDescriptor = {
    id: 'fixture',
    checksum: 'sha256:fixture',
    from: { packageRange: '^1.0.0' },
    to: { packageVersion: '2.0.0' },
    phase: 'post-install',
    implementation: { artifact: 'target' },
    prerequisites: [],
    affectedScopes: [{ kind: 'file', path: 'owned.json' }],
    sideEffects: ['project-files'],
    verification: [{ kind: 'manual', description: 'Verify owned file.' }],
    recovery: { idempotent: true, restartable: true, reversible: true },
  };
  const execution = planExecutionFixtures.migration(descriptor);
  return {
    ...execution,
    plan: {
      ...execution.plan,
      mutations: [
        {
          id: 'migration:fixture:write',
          claim: { kind: 'file', path: 'owned.json' },
          kind: 'write-file',
          path: 'owned.json',
          encoding: 'utf8',
          content: 'after',
          afterDigest: 'unused-by-owner-failure',
        },
      ],
    },
  };
}

/*** Build one reversible projection owning exactly the same local file scope. */
function projectionExecution(): Extract<ApmPlanStepExecution, { readonly kind: 'projection' }> {
  return planExecutionFixtures.projection({
    projectionId: 'fixture',
    path: 'owned.json',
    content: 'after',
    beforeDigest: 'unused-before',
    afterDigest: 'unused-after',
    generatorFingerprint: 'fixture-generator',
  });
}

/*** Persist one in-memory journal update. */
function updateJournal(state: OwnerFailureState, journal: ApmApplyJournal): Promise<void> {
  state.journal = journal;
  return Promise.resolve();
}

/*** Build unused lock methods for direct state-machine execution. */
function inertLockPort(operationId: string, planId: string): ApmApplyPorts['lock'] {
  const lock = {
    schemaVersion: 1 as const,
    operationId,
    planId,
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
  return '2026-09-14T21:15:00.000Z';
}

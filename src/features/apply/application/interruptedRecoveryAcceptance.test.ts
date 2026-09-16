import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import metadata from '../../../../package.json' with { type: 'json' };
import type { ApmApplyJournal, ApmApplyPorts, ApmApplyStepPort } from '../../../types/apply.js';
import type { ApmPlanResult, ApmPlanStep } from '../../../types/plan.js';
import type { ApmPlanStepExecution } from '../../../types/plan-execution.js';
import type { ApmStatusResult } from '../../../types/status.js';
import type { ApmMigrationDescriptor } from '../../../types/update-protocol.js';
import { planExecutionFixtures } from '../../plan/application/fixtures/planExecutionFixtures.js';
import { createSha256PlanDigestPort } from '../../plan/adapters/outbound/createSha256PlanDigestPort.js';
import { createNodeApplyJournalPort } from '../adapters/outbound/createNodeApplyJournalPort.js';
import { createNodeApplyLockPort } from '../adapters/outbound/createNodeApplyLockPort.js';
import { createNodeApplyStepPort } from '../adapters/outbound/createNodeApplyStepPort.js';
import { createApplyJournal } from '../domain/createApplyJournal.js';
import { applyAsync } from './applyAsync.js';

const DIGEST = createSha256PlanDigestPort();
const PERMISSIONS = { ownerCode: false, lifecycleScripts: false, externalEffects: false } as const;
const OWNER_PERMISSIONS = {
  ownerCode: true,
  lifecycleScripts: false,
  externalEffects: false,
} as const;
const EXECUTOR = {
  apmVersion: metadata.version,
  runtime: 'node' as const,
  runtimeVersion: process.versions.node,
};

test('interrupted restartable migration commits observed effect without repeating owner execution', async () => {
  await withProject('apm-migration-resume-', async (rootPath) => {
    const ownedPath = path.join(rootPath, 'owned.json');
    await writeFile(ownedPath, 'after');
    const plan = migrationPlan(rootPath);
    const journalPort = createNodeApplyJournalPort();
    const interrupted = interruptedJournal(plan, OWNER_PERMISSIONS, 'migration-resume');
    await journalPort.createAsync(interrupted);

    const result = await applyAsync(
      {
        mode: 'resume',
        rootPath,
        operationId: interrupted.operationId,
        permissions: OWNER_PERMISSIONS,
      },
      basePorts(plan, journalPort, completedMigrationOwner(ownedPath)),
    );
    const persisted = await journalPort.readAsync(rootPath, interrupted.operationId);

    expect(result.status).toBe('completed');
    expect(persisted?.status).toBe('completed');
    expect(persisted?.steps[0]).toMatchObject({ state: 'committed', attempts: 1 });
    expect(await readFile(ownedPath, 'utf8')).toBe('after');
  });
});

test('interrupted install commits already materialized frozen graph instead of repeating install', async () => {
  await withProject('apm-install-resume-', async (rootPath) => {
    await writeFile(
      path.join(rootPath, 'package.json'),
      `${JSON.stringify({ name: 'install-resume-fixture', version: '1.0.0', packageManager: 'npm@11.6.0' }, null, 2)}\n`,
    );
    await writeFile(
      path.join(rootPath, 'package-lock.json'),
      `${JSON.stringify({ name: 'install-resume-fixture', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'install-resume-fixture', version: '1.0.0' } } }, null, 2)}\n`,
    );
    const plan = installPlan(rootPath);
    const journalPort = createNodeApplyJournalPort();
    const interrupted = interruptedJournal(plan, PERMISSIONS, 'install-resume');
    await journalPort.createAsync(interrupted);

    const result = await applyAsync(
      {
        mode: 'resume',
        rootPath,
        operationId: interrupted.operationId,
        permissions: PERMISSIONS,
      },
      basePorts(plan, journalPort),
    );
    const persisted = await journalPort.readAsync(rootPath, interrupted.operationId);

    expect(result.status).toBe('completed');
    expect(persisted?.status).toBe('completed');
    expect(persisted?.steps[0]).toMatchObject({ state: 'committed', attempts: 1 });
  });
});

/*** Compose real Node lock, journal and step adapters for interrupted-effect recovery. */
function basePorts(
  plan: ApmPlanResult,
  journal: ApmApplyPorts['journal'],
  owner?: ApmApplyStepPort,
): ApmApplyPorts {
  return {
    clock: { nowIso: now },
    operationId: { createOperationId: () => 'unused' },
    lock: createNodeApplyLockPort(),
    journal,
    status: { inspectStatusAsync: () => Promise.resolve(statusFixture(plan.rootPath)) },
    planValidation: { validateAsync: () => Promise.resolve([]) },
    executor: { current: () => plan.executor },
    step: createNodeApplyStepPort({ digest: DIGEST, ...(owner === undefined ? {} : { owner }) }),
  };
}

/*** Build one reviewed restartable migration whose escaped effect is observable from disk. */
function migrationPlan(rootPath: string): ApmPlanResult {
  const step: ApmPlanStep = {
    id: 'migration:@owner/package:fixture',
    kind: 'migration',
    prerequisites: [],
    owner: '@owner/package',
    reason: 'Resume one interrupted package-owned migration.',
    evidence: ['owned.json'],
    execution: migrationExecution(),
  };
  return {
    ...emptyPlan(rootPath, 'migration-plan-fingerprint'),
    id: 'migration-plan',
    steps: [step],
  };
}

/*** Build the exact reviewed migration descriptor and file mutation used by resume acceptance. */
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
          afterDigest: 'observed-by-owner',
        },
      ],
    },
  };
}

/*** Observe a migration's escaped post-state and fail if resume tries to repeat the owner effect. */
function completedMigrationOwner(ownedPath: string): ApmApplyStepPort {
  return {
    observeAsync: async () => ({
      state: (await readFile(ownedPath, 'utf8')) === 'after' ? 'satisfied' : 'pending',
      evidence: ['owned.json'],
    }),
    executeAsync: () => Promise.reject(new Error('Interrupted migration must not execute twice.')),
    rollbackAsync: () =>
      Promise.resolve({ state: 'completed', evidence: ['owner-rollback'], diagnostics: [] }),
  };
}

/*** Build an install step whose empty frozen graph is already materialized after interruption. */
function installPlan(rootPath: string): ApmPlanResult {
  return {
    ...emptyPlan(rootPath, 'install-plan-fingerprint'),
    id: 'install-plan',
    steps: [
      {
        id: 'install:root',
        kind: 'install',
        prerequisites: [],
        installRootId: '.',
        reason: 'Resume one interrupted frozen install.',
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
  };
}

/*** Build one complete plan shell for interrupted-effect acceptance. */
function emptyPlan(rootPath: string, fingerprint: string): ApmPlanResult {
  return {
    schemaVersion: 2,
    operation: 'plan',
    id: 'acceptance-plan',
    rootPath,
    complete: true,
    policy: {
      dependencyUpdates: 'none',
      selections: [],
      repairInstallations: true,
      repairProjections: true,
      maxGeneratorIterations: 4,
    },
    executor: EXECUTOR,
    inputFingerprint: { value: fingerprint, statusSchemaVersion: 2, availabilityCheckedAt: [] },
    targets: [],
    files: [],
    packages: [],
    artifacts: [],
    steps: [],
    effects: [],
    findings: [],
    blockers: [],
    diagnostics: [],
  };
}

/*** Convert a fresh journal to durable process-interruption state after its effect started. */
function interruptedJournal(
  plan: ApmPlanResult,
  permissions: typeof PERMISSIONS | typeof OWNER_PERMISSIONS,
  operationId: string,
): ApmApplyJournal {
  const journal = createApplyJournal(plan, permissions, operationId, now());
  return {
    ...journal,
    status: 'recovery-required',
    steps: journal.steps.map((step) => ({
      ...step,
      state: 'effect-started' as const,
      attempts: 1,
    })),
  };
}

/*** Build current project evidence unused by resume after durable journal admission. */
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
      packageManagers: [],
      buildTools: [],
      packageCount: 0,
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

/*** Run one isolated project-root acceptance case and clean durable APM state afterwards. */
async function withProject(
  prefix: string,
  run: (rootPath: string) => Promise<void>,
): Promise<void> {
  const rootPath = await mkdtemp(path.join(tmpdir(), prefix));
  try {
    await run(rootPath);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
}

/*** Return one deterministic journal timestamp for interrupted recovery fixtures. */
function now(): string {
  return '2026-09-16T20:30:00.000Z';
}

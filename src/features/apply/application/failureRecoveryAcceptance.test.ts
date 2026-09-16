import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import metadata from '../../../../package.json' with { type: 'json' };
import type { ApmApplyJournal, ApmApplyPorts } from '../../../types/apply.js';
import type { ApmPlanResult } from '../../../types/plan.js';
import type { ApmStatusResult } from '../../../types/status.js';
import { createSha256PlanDigestPort } from '../../plan/adapters/outbound/createSha256PlanDigestPort.js';
import { validateSavedPlanAsync } from '../../plan/domain/validateSavedPlanAsync.js';
import { statusProjectAsync } from '../../status/composition/statusProjectAsync.js';
import { createNodeApplyJournalPort } from '../adapters/outbound/createNodeApplyJournalPort.js';
import { createNodeApplyLockPort } from '../adapters/outbound/createNodeApplyLockPort.js';
import { createNodeApplyStepPort } from '../adapters/outbound/createNodeApplyStepPort.js';
import { createApplyJournal } from '../domain/createApplyJournal.js';
import { applyAsync } from './applyAsync.js';
import { runApplyStepsAsync } from './runApplyStepsAsync.js';

const DIGEST = createSha256PlanDigestPort();
const PERMISSIONS = { ownerCode: false, lifecycleScripts: false, externalEffects: false } as const;
const EXECUTOR = {
  apmVersion: metadata.version,
  runtime: 'node' as const,
  runtimeVersion: process.versions.node,
};

test('stale saved plan is rejected before project mutation or durable journal creation', async () => {
  await withProject('apm-stale-plan-', async (rootPath) => {
    const manifestPath = path.join(rootPath, 'package.json');
    const manifest = `${JSON.stringify({ name: 'stale-plan-fixture', version: '1.0.0' }, null, 2)}\n`;
    await writeFile(manifestPath, manifest);
    const plan = emptyPlan(rootPath, 'reviewed-stale-fingerprint');
    const journal = createNodeApplyJournalPort();
    const result = await applyAsync(
      { mode: 'start', plan, permissions: PERMISSIONS },
      {
        ...basePorts(plan, journal),
        status: {
          inspectStatusAsync: (projectRoot) =>
            statusProjectAsync({ rootPath: projectRoot, availability: 'offline' }),
        },
        planValidation: {
          validateAsync: ({ plan: saved, status, executor }) =>
            validateSavedPlanAsync(saved, status, executor, DIGEST),
        },
      },
    );

    expect(result.status).toBe('blocked');
    expect(result.blockers.map(({ code }) => code)).toContain('apply.plan-stale');
    expect(await journal.readAsync(rootPath, result.operationId)).toBeUndefined();
    expect(await readFile(manifestPath, 'utf8')).toBe(manifest);
  });
});

test('filesystem project-writer lock serializes concurrent writers', async () => {
  await withProject('apm-writer-lock-', async (rootPath) => {
    const first = createNodeApplyLockPort();
    const second = createNodeApplyLockPort();
    const acquired = await first.acquireAsync({
      rootPath,
      operationId: 'writer-a',
      planId: 'plan-a',
      resume: false,
    });
    const conflict = await second.acquireAsync({
      rootPath,
      operationId: 'writer-b',
      planId: 'plan-b',
      resume: false,
    });

    expect(acquired.state).toBe('acquired');
    expect(conflict.state).toBe('conflict');
    expect(conflict.lock.operationId).toBe('writer-a');

    await first.releaseAsync(rootPath, 'writer-a');
    const next = await second.acquireAsync({
      rootPath,
      operationId: 'writer-b',
      planId: 'plan-b',
      resume: false,
    });
    expect(next.state).toBe('acquired');
    await second.releaseAsync(rootPath, 'writer-b');
  });
});

test('user-owned file conflict is persisted without overwriting user state', async () => {
  await withProject('apm-file-conflict-', async (rootPath) => {
    const filePath = path.join(rootPath, 'config.json');
    await writeFile(filePath, 'user-owned-change');
    const plan = await filePlanAsync(rootPath, 'reviewed-before', 'reviewed-after');
    const journalPort = createNodeApplyJournalPort();
    const journal = createApplyJournal(plan, PERMISSIONS, 'file-conflict', now());
    await journalPort.createAsync(journal);

    const outcome = await runApplyStepsAsync(journal, basePorts(plan, journalPort));
    const persisted = await journalPort.readAsync(rootPath, journal.operationId);

    expect(outcome.status).toBe('recovery-required');
    expect(outcome.blockers.map(({ code }) => code)).toEqual(['apply.precondition-changed']);
    expect(persisted?.status).toBe('recovery-required');
    expect(persisted?.steps[0]?.state).toBe('recovery-required');
    expect(await readFile(filePath, 'utf8')).toBe('user-owned-change');
  });
});

test('interrupted local file effect resumes from durable journal without Git', async () => {
  await withProject('apm-no-git-resume-', async (rootPath) => {
    const filePath = path.join(rootPath, 'config.json');
    const plan = await filePlanAsync(rootPath, 'before', 'after');
    await writeFile(filePath, 'after');
    const journalPort = createNodeApplyJournalPort();
    const interrupted = interruptedJournal(plan, 'no-git-resume');
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
    const hasGit = await access(path.join(rootPath, '.git')).then(
      () => true,
      () => false,
    );

    expect(result.status).toBe('completed');
    expect(persisted?.status).toBe('completed');
    expect(persisted?.steps[0]).toMatchObject({ state: 'committed', attempts: 1 });
    expect(await readFile(filePath, 'utf8')).toBe('after');
    expect(hasGit).toBe(false);
  });
});

/*** Compose real Node lock, journal and step adapters around one frozen acceptance plan. */
function basePorts(plan: ApmPlanResult, journal: ApmApplyPorts['journal']): ApmApplyPorts {
  return {
    clock: { nowIso: now },
    operationId: { createOperationId: () => 'acceptance-start' },
    lock: createNodeApplyLockPort(),
    journal,
    status: { inspectStatusAsync: () => Promise.resolve(statusFixture(plan.rootPath)) },
    planValidation: { validateAsync: () => Promise.resolve([]) },
    executor: { current: () => plan.executor },
    step: createNodeApplyStepPort({ digest: DIGEST }),
  };
}

/*** Build one complete file update plan with exact SHA-256 before/after preconditions. */
async function filePlanAsync(
  rootPath: string,
  beforeContent: string,
  afterContent: string,
): Promise<ApmPlanResult> {
  const [beforeDigest, afterDigest] = await Promise.all([
    DIGEST.digestAsync(beforeContent),
    DIGEST.digestAsync(afterContent),
  ]);
  return {
    ...emptyPlan(rootPath, 'file-plan-fingerprint'),
    id: 'file-plan',
    files: [
      {
        path: 'config.json',
        kind: 'update',
        beforeDigest,
        afterDigest,
        beforeContent,
        afterContent,
      },
    ],
    steps: [
      {
        id: 'dependency-files:root',
        kind: 'dependency-files',
        prerequisites: [],
        installRootId: '.',
        reason: 'Apply the reviewed file state.',
        evidence: ['config.json'],
        execution: { kind: 'dependency-files', filePaths: ['config.json'] },
      },
    ],
  };
}

/*** Build one complete plan shell for acceptance cases that own their concrete reviewed steps. */
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

/*** Convert a fresh journal to durable interruption state after its local effect started. */
function interruptedJournal(plan: ApmPlanResult, operationId: string): ApmApplyJournal {
  const journal = createApplyJournal(plan, PERMISSIONS, operationId, now());
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

/*** Build current project evidence used only by ports that are not reached in resume execution. */
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

/*** Run one isolated project-root acceptance case and clean all durable APM state afterwards. */
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

/*** Return one deterministic journal timestamp for acceptance fixtures. */
function now(): string {
  return '2026-09-16T20:30:00.000Z';
}

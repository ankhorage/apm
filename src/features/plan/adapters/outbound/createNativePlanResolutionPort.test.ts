import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

import type { ApmPlanResolutionRequest } from '../../../../types/plan.js';
import { createNativePlanResolutionPort } from './createNativePlanResolutionPort.js';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);

test('keeps the repository Bun v2 graph complete across staged direct resolution', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'ankhorage-apm-bun-plan-'));
  try {
    await Promise.all([
      copyFile(path.join(REPOSITORY_ROOT, 'package.json'), path.join(projectRoot, 'package.json')),
      copyFile(path.join(REPOSITORY_ROOT, 'bun.lock'), path.join(projectRoot, 'bun.lock')),
    ]);
    await addSelfReferencingOverrideAsync(projectRoot);

    const result = await createNativePlanResolutionPort().resolveAsync(requestFixture(projectRoot));
    if (!result.complete) {
      throw new Error(
        `Bun staged resolution became incomplete:\n${JSON.stringify(
          { blockers: result.blockers, diagnostics: result.diagnostics },
          null,
          2,
        )}`,
      );
    }

    expect(result.manager).toBe('bun');
    expect(result.blockers).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

function requestFixture(projectRoot: string): ApmPlanResolutionRequest {
  return {
    rootPath: projectRoot,
    installRootId: '.',
    installRootPath: projectRoot,
    packagePaths: [projectRoot],
    lockfilePath: path.join(projectRoot, 'bun.lock'),
    manager: 'bun',
    managerVersion: '1.4.2',
    linker: 'isolated',
    targets: [
      directTarget('@ankhorage/project-detector', '^0.1.0', '0.1.0', 'dependency'),
      directTarget('@ankhorage/utility', '^1.4.0', '1.4.0', 'dependency'),
      directTarget('jsonc-parser', '^3.3.1', '3.3.1', 'dependency'),
      directTarget('semver', '^7.8.5', '7.8.5', 'dependency'),
      directTarget('@types/node', '^26.6.4', '26.6.4', 'development'),
    ],
  };
}

function directTarget(
  name: string,
  range: string,
  version: string,
  kind: 'dependency' | 'development',
): ApmPlanResolutionRequest['targets'][number] {
  return {
    installRootId: '.',
    packageId: `.::bun:${name}`,
    ownerPath: 'package.json',
    name,
    direct: true,
    kind,
    currentRange: range,
    currentVersion: version,
    targetVersion: version,
    targetRange: range,
    source: 'exact',
    reason: 'Replay reviewed direct targets through Bun lockfile-only staging.',
  };
}

async function addSelfReferencingOverrideAsync(projectRoot: string): Promise<void> {
  const packagePath = path.join(projectRoot, 'package.json');
  const manifest: unknown = JSON.parse(await readFile(packagePath, 'utf8'));
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error('APM package fixture must contain an object.');
  }
  await writeFile(
    packagePath,
    `${JSON.stringify({ ...manifest, overrides: { semver: '$semver' } }, null, 2)}\n`,
    'utf8',
  );
}

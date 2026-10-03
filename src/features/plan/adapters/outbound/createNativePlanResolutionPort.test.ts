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
      {
        installRootId: '.',
        packageId: '.::bun:semver',
        ownerPath: 'package.json',
        name: 'semver',
        direct: true,
        kind: 'dependency',
        currentRange: '^7.8.5',
        currentVersion: '7.8.5',
        targetVersion: '7.8.5',
        targetRange: '^7.8.5',
        source: 'exact',
        reason: 'Replay one reviewed direct target through Bun lockfile-only staging.',
      },
    ],
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

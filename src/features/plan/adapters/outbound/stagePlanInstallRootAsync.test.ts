import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { pathExists } from '@ankhorage/utility/node/fs';
import { expect, test } from 'bun:test';

import type { ApmPlanResolutionRequest } from '../../../../types/plan.js';
import { applyStagedPlanTargetsAsync } from './applyStagedPlanTargetsAsync.js';
import { collectStagedPlanFileChangesAsync } from './collectStagedPlanFileChangesAsync.js';
import { stagePlanInstallRootAsync } from './stagePlanInstallRootAsync.js';

test('planning staging copies package-manager evidence only and leaves source project bytes unchanged', async () => {
  const project = await createProjectFixtureAsync();
  const originalManifest = await readFile(path.join(project, 'package.json'), 'utf8');
  const originalSource = await readFile(path.join(project, 'src', 'danger.ts'), 'utf8');
  const stage = await stagePlanInstallRootAsync(requestFixture(project));

  try {
    expect(await pathExists(path.join(stage.rootPath, 'package.json'))).toBe(true);
    expect(await pathExists(path.join(stage.rootPath, '.npmrc'))).toBe(true);
    expect(await pathExists(path.join(stage.rootPath, 'src', 'danger.ts'))).toBe(false);

    const expectations = await applyStagedPlanTargetsAsync(requestFixture(project), stage);
    const changes = await collectStagedPlanFileChangesAsync(
      requestFixture(project),
      stage,
      expectations,
    );

    expect(changes.blockers).toEqual([]);
    expect(changes.files).toHaveLength(1);
    expect(changes.files[0]).toMatchObject({ path: 'package.json', kind: 'update' });
    expect(await readFile(path.join(project, 'package.json'), 'utf8')).toBe(originalManifest);
    expect(await readFile(path.join(project, 'src', 'danger.ts'), 'utf8')).toBe(originalSource);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(stage.rootPath, { recursive: true, force: true });
  }
});

test('native resolver manifest changes beyond reviewed APM ranges are blockers', async () => {
  const project = await createProjectFixtureAsync();
  const stage = await stagePlanInstallRootAsync(requestFixture(project));

  try {
    const expectations = await applyStagedPlanTargetsAsync(requestFixture(project), stage);
    const manifestPath = path.join(stage.rootPath, 'package.json');
    const reviewed = await readFile(manifestPath, 'utf8');
    await writeFile(
      manifestPath,
      reviewed.replace('"dependencies": {', '"dependencies": {\n    "hidden": "1.0.0",'),
      'utf8',
    );

    const changes = await collectStagedPlanFileChangesAsync(
      requestFixture(project),
      stage,
      expectations,
    );

    expect(changes.files).toEqual([]);
    expect(changes.blockers.map(({ code }) => code)).toEqual(['plan.resolution-failed']);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(stage.rootPath, { recursive: true, force: true });
  }
});

/*** Create a package fixture containing source that must never enter the planning workspace. */
async function createProjectFixtureAsync(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'apm-plan-stage-test-'));
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'fixture',
        version: '1.0.0',
        packageManager: 'npm@11.0.0',
        dependencies: { 'example-package': '^1.0.0' },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  await writeFile(path.join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n', 'utf8');
  await writeFile(path.join(root, '.npmrc'), 'ignore-scripts=true\n', 'utf8');
  await writeFile(path.join(root, 'src', 'danger.ts'), 'throw new Error("must not run");\n', 'utf8');
  return root;
}

/*** Build one reviewed direct range update for staging behavior tests. */
function requestFixture(rootPath: string): ApmPlanResolutionRequest {
  return {
    rootPath,
    installRootId: '.',
    installRootPath: rootPath,
    packagePaths: [rootPath],
    lockfilePath: path.join(rootPath, 'package-lock.json'),
    manager: 'npm',
    managerVersion: '11.0.0',
    linker: 'node-modules',
    targets: [
      {
        installRootId: '.',
        packageId: 'node_modules/example-package',
        name: 'example-package',
        direct: true,
        ownerPath: 'package.json',
        kind: 'dependency',
        currentRange: '^1.0.0',
        currentVersion: '1.0.0',
        targetVersion: '1.2.0',
        targetRange: '^1.2.0',
        source: 'exact',
        reason: 'test',
      },
    ],
  };
}

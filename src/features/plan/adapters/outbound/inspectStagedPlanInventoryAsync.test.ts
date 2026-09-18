import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import type { ApmPlanResolutionRequest } from '../../../../types/plan.js';
import { inspectStagedPlanInventoryAsync } from './inspectStagedPlanInventoryAsync.js';

test('re-inspects supported Bun text lock versions as complete staged plan graphs', async () => {
  await Promise.all(
    ([1, 2] as const).map((lockfileVersion) =>
      withBunStageAsync(lockfileVersion, async (rootPath) => {
        const result = await inspectStagedPlanInventoryAsync(
          requestFixture(rootPath),
          { rootPath, files: [] },
        );

        expect(result?.complete).toBe(true);
        expect(result?.manager.name).toBe('bun');
        expect(result?.lockfile.version).toBe(String(lockfileVersion));
      }),
    ),
  );
});

test('keeps unsupported Bun text lock versions incomplete during staged plan reinspection', async () => {
  await withBunStageAsync(3, async (rootPath) => {
    expect(
      await inspectStagedPlanInventoryAsync(requestFixture(rootPath), { rootPath, files: [] }),
    ).toBeUndefined();
  });
});

/*** Create one isolated Bun staging fixture with an explicit text lock version. */
async function withBunStageAsync(
  lockfileVersion: number,
  run: (rootPath: string) => Promise<void>,
): Promise<void> {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-plan-bun-reinspection-'));
  try {
    await writeFile(
      path.join(rootPath, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        packageManager: 'bun@1.4.2',
        dependencies: { dep: '^1.0.0' },
      }),
      'utf8',
    );
    await writeFile(
      path.join(rootPath, 'bun.lock'),
      JSON.stringify({
        lockfileVersion,
        configVersion: 1,
        packages: { dep: ['dep@1.0.0', '', {}] },
      }),
      'utf8',
    );
    await run(rootPath);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
}

/*** Build the plan resolution request used by staged Bun reinspection tests. */
function requestFixture(rootPath: string): ApmPlanResolutionRequest {
  return {
    rootPath,
    installRootId: '.',
    installRootPath: rootPath,
    packagePaths: [rootPath],
    lockfilePath: path.join(rootPath, 'bun.lock'),
    manager: 'bun',
    managerVersion: '1.4.2',
    targets: [],
  };
}

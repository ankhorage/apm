import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { inspectProjectAsync } from '@ankhorage/project-detector/node';
import { expect, test } from 'bun:test';

import { inspectDependencyInventoryAsync } from '../../../../nodeApm.js';

test('allows absent Bun packages excluded by current host constraints while requiring applicable packages', async () => {
  await withFixtureAsync(async (root) => {
    const excludedOs = process.platform === 'darwin' ? 'linux' : 'darwin';
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        packageManager: 'bun@1.4.2',
        dependencies: {
          required: '^1.0.0',
          'excluded-by-os': '^1.0.0',
        },
      }),
    );
    await writeFile(
      path.join(root, 'bun.lock'),
      JSON.stringify({
        lockfileVersion: 2,
        configVersion: 1,
        packages: {
          required: [
            'required@1.0.0',
            '',
            { os: process.platform, cpu: process.arch },
          ],
          'excluded-by-os': ['excluded-by-os@1.0.0', '', { os: excludedOs }],
        },
      }),
    );

    const inventory = await inspectDependencyInventoryAsync({
      inspection: await inspectProjectAsync(root),
    });
    const installRoot = inventory.roots[0];
    const required = installRoot?.lockedPackages.find(({ name }) => name === 'required');
    const excluded = installRoot?.lockedPackages.find(({ name }) => name === 'excluded-by-os');

    expect(required?.optional).toBe(false);
    expect(excluded?.optional).toBe(true);
    expect(
      installRoot?.installedPackages.find(({ packageId }) => packageId === 'bun:required')?.state,
    ).toBe('absent');
    expect(
      installRoot?.installedPackages.find(({ packageId }) => packageId === 'bun:excluded-by-os')
        ?.state,
    ).toBe('absent');
  });
});

/*** Keep filesystem evidence isolated and remove it after every platform-constraint regression. */
async function withFixtureAsync(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'apm-bun-platform-'));
  try {
    await mkdir(root, { recursive: true });
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

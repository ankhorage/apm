import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { inspectProjectAsync } from '@ankhorage/project-detector/node';
import { expect, test } from 'bun:test';

import { inspectDependencyInventoryAsync } from '../../../../nodeApm.js';
import { evaluateDependencyFindings } from '../../domain/evaluateDependencyFindings.js';

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
    const requiredInstalled = installRoot?.installedPackages.find(
      ({ packageId }) => packageId === 'bun:required',
    );
    const excludedInstalled = installRoot?.installedPackages.find(
      ({ packageId }) => packageId === 'bun:excluded-by-os',
    );
    if (
      installRoot === undefined ||
      required === undefined ||
      excluded === undefined ||
      requiredInstalled === undefined ||
      excludedInstalled === undefined
    ) {
      throw new Error('Expected Bun platform fixture evidence.');
    }

    expect(required.optional).toBe(false);
    expect(excluded.optional).toBe(true);
    expect(requiredInstalled.state).toBe('absent');
    expect(excludedInstalled.state).toBe('absent');
    expect(
      evaluateDependencyFindings({
        packageId: 'root::bun:required',
        pkg: required,
        installed: requiredInstalled,
        availability: {
          packageId: 'root::bun:required',
          name: 'required',
          state: 'not-applicable',
        },
      }).map(({ code }) => code),
    ).toContain('install-absent');
    expect(
      evaluateDependencyFindings({
        packageId: 'root::bun:excluded-by-os',
        pkg: excluded,
        installed: excludedInstalled,
        availability: {
          packageId: 'root::bun:excluded-by-os',
          name: 'excluded-by-os',
          state: 'not-applicable',
        },
      }).map(({ code }) => code),
    ).not.toContain('install-absent');
  });
});

/*** Keep filesystem evidence isolated and remove it after every platform-constraint regression. */
async function withFixtureAsync(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'apm-bun-platform-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

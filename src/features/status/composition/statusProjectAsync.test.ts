import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { pathExists } from '@ankhorage/utility/node/fs';
import { expect, test } from 'bun:test';

import { statusProjectAsync } from './statusProjectAsync.js';

test('inspects an ordinary JavaScript project without config or lifecycle execution', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-readonly-'));
  const markerPath = path.join(rootPath, 'SHOULD_NOT_EXIST');
  const manifestPath = path.join(rootPath, 'package.json');
  const lockPath = path.join(rootPath, 'package-lock.json');
  const manifest = `${JSON.stringify(
    {
      name: 'readonly-fixture',
      packageManager: 'npm@11.6.0',
      scripts: {
        preinstall: `node -e "require('node:fs').writeFileSync('${markerPath}', 'executed')"`,
      },
    },
    null,
    2,
  )}\n`;
  const lockfile = `${JSON.stringify(
    {
      name: 'readonly-fixture',
      lockfileVersion: 3,
      packages: { '': { name: 'readonly-fixture' } },
    },
    null,
    2,
  )}\n`;

  try {
    await writeFile(manifestPath, manifest);
    await writeFile(lockPath, lockfile);

    const result = await statusProjectAsync({
      rootPath,
      availability: 'offline',
      hostPackages: [],
    });

    expect(result.operation).toBe('status');
    expect(result.complete).toBe(true);
    expect(await readFile(manifestPath, 'utf8')).toBe(manifest);
    expect(await readFile(lockPath, 'utf8')).toBe(lockfile);
    expect(await pathExists(path.join(rootPath, 'ankh.config.json'))).toBe(false);
    expect(await pathExists(markerPath)).toBe(false);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test('uses an explicitly supplied host availability adapter without changing incomplete evidence', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-host-registry-'));
  const calls: string[] = [];
  try {
    await writeFile(
      path.join(rootPath, 'package.json'),
      JSON.stringify({ name: 'fixture', packageManager: 'npm@12.0.2' }),
    );
    await writeFile(
      path.join(rootPath, 'package-lock.json'),
      JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'fixture' } } }),
    );
    const result = await statusProjectAsync(
      { rootPath, hostPackages: [], availability: 'offline' },
      {
        availability: {
          queryAvailabilityAsync: (input) => {
            calls.push(input.rootPath);
            return Promise.resolve({ complete: false, packages: [], diagnostics: [] });
          },
        },
      },
    );
    expect(calls).toEqual([rootPath]);
    expect(result.complete).toBe(false);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

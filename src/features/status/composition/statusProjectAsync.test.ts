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

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import type { ApmRegistryFetch } from '../../../types/registry.js';
import { createNpmRegistryAvailabilityPort } from '../adapters/outbound/createNpmRegistryAvailabilityPort.js';
import { statusProjectAsync } from './statusProjectAsync.js';

test('offline registry metadata stays unknown and does not mutate the inspected project', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-offline-status-'));
  const manifestPath = path.join(rootPath, 'package.json');
  const lockPath = path.join(rootPath, 'package-lock.json');
  const manifest = `${JSON.stringify(
    {
      name: 'offline-status-fixture',
      packageManager: 'npm@11.6.0',
      dependencies: { dep: '^1.0.0' },
    },
    null,
    2,
  )}\n`;
  const lockfile = `${JSON.stringify(
    {
      name: 'offline-status-fixture',
      lockfileVersion: 3,
      packages: {
        '': { name: 'offline-status-fixture', dependencies: { dep: '^1.0.0' } },
        'node_modules/dep': { name: 'dep', version: '1.0.0' },
      },
    },
    null,
    2,
  )}\n`;
  const calls: string[] = [];
  const fetchFn: ApmRegistryFetch = (input) => {
    calls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return Promise.reject(new Error('network must not be called in offline mode'));
  };

  try {
    await writeFile(manifestPath, manifest);
    await writeFile(lockPath, lockfile);
    const availability = createNpmRegistryAvailabilityPort({
      fetchFn,
      home: path.join(rootPath, 'empty-home'),
    });
    const result = await statusProjectAsync(
      { rootPath, availability: 'offline', hostPackages: [] },
      { availability },
    );

    expect(calls).toEqual([]);
    expect(result.complete).toBe(false);
    expect(result.currency).toBe('unknown');
    expect(result.dependencies[0]?.availability.state).toBe('unknown');
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'status.registry.availability-unknown',
    );
    expect(await readFile(manifestPath, 'utf8')).toBe(manifest);
    expect(await readFile(lockPath, 'utf8')).toBe(lockfile);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test('unavailable registry refresh stays incomplete and redacts transport credentials', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-unavailable-status-'));
  const manifestPath = path.join(rootPath, 'package.json');
  const lockPath = path.join(rootPath, 'package-lock.json');

  try {
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'unavailable-status-fixture',
        packageManager: 'npm@11.6.0',
        dependencies: { dep: '^1.0.0' },
      }),
    );
    await writeFile(
      lockPath,
      JSON.stringify({
        name: 'unavailable-status-fixture',
        lockfileVersion: 3,
        packages: {
          '': { name: 'unavailable-status-fixture', dependencies: { dep: '^1.0.0' } },
          'node_modules/dep': { name: 'dep', version: '1.0.0' },
        },
      }),
    );
    const availability = createNpmRegistryAvailabilityPort({
      home: path.join(rootPath, 'empty-home'),
      fetchFn: () =>
        Promise.reject(
          new Error('request to https://user:private-password@registry.example/dep failed'),
        ),
    });
    const result = await statusProjectAsync(
      { rootPath, availability: 'refresh', hostPackages: [] },
      { availability },
    );

    expect(result.complete).toBe(false);
    expect(result.currency).toBe('unknown');
    expect(result.dependencies[0]?.availability.state).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('private-password');
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

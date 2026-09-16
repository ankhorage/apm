import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import type { ApmRegistryFetch } from '../../../types/registry.js';
import { createNpmRegistryAvailabilityPort } from '../adapters/outbound/createNpmRegistryAvailabilityPort.js';
import { statusProjectAsync } from './statusProjectAsync.js';

test('offline registry metadata stays unknown and does not mutate the inspected project', async () => {
  await withDependencyProject('apm-offline-status-', async ({ rootPath, manifest, lockfile }) => {
    const calls: string[] = [];
    const fetchFn: ApmRegistryFetch = (input) => {
      calls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      return Promise.reject(new Error('network must not be called in offline mode'));
    };
    const availability = createNpmRegistryAvailabilityPort({
      fetchFn,
      home: path.join(rootPath, 'empty-home'),
    });
    const result = await statusProjectAsync(
      { rootPath, availability: 'offline', hostPackages: [] },
      { availability },
    );

    expect(calls).toEqual([]);
    expectUnknownRegistryResult(result);
    expect(await readFile(path.join(rootPath, 'package.json'), 'utf8')).toBe(manifest);
    expect(await readFile(path.join(rootPath, 'package-lock.json'), 'utf8')).toBe(lockfile);
  });
});

test('unavailable registry refresh stays incomplete and redacts transport credentials', async () => {
  await withDependencyProject('apm-unavailable-status-', async ({ rootPath }) => {
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

    expectUnknownRegistryResult(result);
    expect(JSON.stringify(result)).not.toContain('private-password');
  });
});

/*** Require unavailable registry evidence to remain explicitly incomplete and unknown. */
function expectUnknownRegistryResult(result: Awaited<ReturnType<typeof statusProjectAsync>>): void {
  expect(result.complete).toBe(false);
  expect(result.currency).toBe('unknown');
  expect(result.dependencies[0]?.availability.state).toBe('unknown');
  expect(result.diagnostics.map(({ code }) => code)).toContain(
    'status.registry.availability-unknown',
  );
}

interface DependencyProjectFixture {
  readonly rootPath: string;
  readonly manifest: string;
  readonly lockfile: string;
}

/*** Run one isolated locked dependency fixture and preserve its source files for mutation assertions. */
async function withDependencyProject(
  prefix: string,
  run: (fixture: DependencyProjectFixture) => Promise<void>,
): Promise<void> {
  const rootPath = await mkdtemp(path.join(tmpdir(), prefix));
  const manifest = dependencyManifest();
  const lockfile = dependencyLockfile();
  try {
    await writeFile(path.join(rootPath, 'package.json'), manifest);
    await writeFile(path.join(rootPath, 'package-lock.json'), lockfile);
    await run({ rootPath, manifest, lockfile });
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
}

/*** Build one npm manifest with a direct dependency whose registry evidence is intentionally absent. */
function dependencyManifest(): string {
  return `${JSON.stringify(
    {
      name: 'registry-status-fixture',
      packageManager: 'npm@11.6.0',
      dependencies: { dep: '^1.0.0' },
    },
    null,
    2,
  )}\n`;
}

/*** Build the matching npm lockfile so only registry availability is incomplete. */
function dependencyLockfile(): string {
  return `${JSON.stringify(
    {
      name: 'registry-status-fixture',
      lockfileVersion: 3,
      packages: {
        '': { name: 'registry-status-fixture', dependencies: { dep: '^1.0.0' } },
        'node_modules/dep': { name: 'dep', version: '1.0.0' },
      },
    },
    null,
    2,
  )}\n`;
}

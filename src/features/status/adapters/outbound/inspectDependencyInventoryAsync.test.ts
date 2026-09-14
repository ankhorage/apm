import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ProjectInspection } from '@ankhorage/project-detector/types';
import { expect, test } from 'bun:test';

import { inspectDependencyInventoryAsync } from './inspectDependencyInventoryAsync.js';

test('reports conflicting lockfiles unless packageManager explicitly selects one', async () => {
  await withFixture(async (root) => {
    await writeJson(root, 'package.json', { name: 'fixture', dependencies: { dep: '^1.0.0' } });
    await writeJson(root, 'package-lock.json', npmLock({ dep: '1.0.0' }));
    await writeFile(path.join(root, 'bun.lock'), bunLock('fixture'));

    const conflict = await inspectDependencyInventoryAsync({
      inspection: createInspection(root, ['package.json'], ['npm', 'bun']),
    });
    expect(conflict.complete).toBe(false);
    expect(conflict.roots[0]?.manager.state).toBe('conflict');
    expect(conflict.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'status.manager.conflict',
    );

    await writeJson(root, 'package.json', {
      name: 'fixture',
      packageManager: 'npm@12.0.2',
      dependencies: { dep: '^1.0.0' },
    });
    const selected = await inspectDependencyInventoryAsync({
      inspection: createInspection(root, ['package.json'], ['npm', 'bun']),
    });
    expect(selected.complete).toBe(true);
    expect(selected.roots[0]?.manager.name).toBe('npm');
    expect(selected.roots[0]?.declarations[0]?.resolvedPackageId).toBe('node_modules/dep');
    expect(selected.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'status.manager.conflicting-lockfile-ignored',
    );
  });
});

test('keeps nested apps with their own package manager as independent install roots', async () => {
  await withFixture(async (root) => {
    await writeJson(root, 'package.json', { name: 'root', packageManager: 'npm@12.0.2' });
    await writeJson(root, 'package-lock.json', npmLock({}));
    await writeJson(root, 'packages/app/package.json', {
      name: 'nested',
      packageManager: 'bun@1.4.2',
      dependencies: { dep: '^1.0.0' },
    });
    await writeFile(path.join(root, 'packages/app/bun.lock'), bunLock('nested'));

    const inventory = await inspectDependencyInventoryAsync({
      inspection: createInspection(
        root,
        ['package.json', 'packages/app/package.json'],
        ['npm', 'bun'],
      ),
    });

    expect(inventory.roots.map((item) => item.id).sort()).toEqual(['.', 'packages/app']);
    expect(inventory.roots.find((item) => item.id === '.')?.packagePaths).toEqual([root]);
    expect(inventory.roots.find((item) => item.id === 'packages/app')?.manager.name).toBe('bun');
  });
});

test('parses pnpm v9 importers and package instances without requiring an install', async () => {
  await withFixture(async (root) => {
    await writeJson(root, 'package.json', {
      name: 'fixture',
      packageManager: 'pnpm@11.21.0',
      dependencies: { dep: '^1.0.0' },
    });
    await writeFile(path.join(root, 'pnpm-lock.yaml'), pnpmLock());

    const inventory = await inspectDependencyInventoryAsync({
      inspection: createInspection(root, ['package.json'], ['pnpm']),
    });
    const [installRoot] = inventory.roots;
    expect(inventory.complete).toBe(true);
    expect(installRoot?.lockfile.version).toBe('9.0');
    expect(installRoot?.lockedPackages[0]?.id).toBe('pnpm:dep@1.0.0');
    expect(installRoot?.installedPackages[0]?.state).toBe('absent');
  });
});

test('does not execute inlined Yarn PnP maps and reports installation evidence incomplete', async () => {
  await withFixture(async (root) => {
    await writeJson(root, 'package.json', {
      name: 'fixture',
      packageManager: 'yarn@4.18.0',
      dependencies: { dep: '^1.0.0' },
    });
    await writeFile(path.join(root, 'yarn.lock'), yarnLock());
    await writeFile(path.join(root, '.pnp.cjs'), 'throw new Error("must never execute");\n');

    const inventory = await inspectDependencyInventoryAsync({
      inspection: createInspection(root, ['package.json'], ['yarn']),
    });
    expect(inventory.complete).toBe(false);
    expect(inventory.roots[0]?.linker).toBe('pnp');
    expect(inventory.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'status.install.yarn.pnp-inlined',
    );
    expect(inventory.roots[0]?.installedPackages[0]?.state).toBe('unknown');
  });
});

test('preserves duplicate npm package instances and their physical dependency edge', async () => {
  await withFixture(async (root) => {
    await writeJson(root, 'package.json', {
      name: 'fixture',
      packageManager: 'npm@12.0.2',
      dependencies: { parent: '^1.0.0' },
    });
    await writeJson(root, 'package-lock.json', duplicateNpmLock());

    const inventory = await inspectDependencyInventoryAsync({
      inspection: createInspection(root, ['package.json'], ['npm']),
    });
    const [rootEvidence] = inventory.roots;
    if (rootEvidence === undefined) throw new Error('Expected npm install-root evidence.');
    expect(
      rootEvidence.lockedPackages.filter((pkg) => pkg.name === 'dep').map((pkg) => pkg.id),
    ).toEqual(['node_modules/dep', 'node_modules/parent/node_modules/dep']);
    expect(
      rootEvidence.lockedPackages.find((pkg) => pkg.name === 'parent')?.dependencies[0]?.packageId,
    ).toBe('node_modules/parent/node_modules/dep');
  });
});

/*** Run one isolated filesystem fixture and remove it after the assertion. */
async function withFixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'apm-status-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/*** Write JSON fixture data while creating any nested package directory. */
async function writeJson(root: string, relativePath: string, value: unknown): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

/*** Build the minimum Bun text-lock fixture used by manager-selection tests. */
function bunLock(name: string): string {
  return JSON.stringify({
    lockfileVersion: 2,
    configVersion: 1,
    workspaces: { '': { name, dependencies: { dep: '^1.0.0' } } },
    packages: { dep: ['dep@1.0.0', '', {}, 'sha512-fixture'] },
  });
}

/*** Build the minimum pnpm v9 lock fixture used by inventory parsing tests. */
function pnpmLock(): string {
  return [
    "lockfileVersion: '9.0'",
    'importers:',
    '  .:',
    '    dependencies:',
    '      dep:',
    "        specifier: '^1.0.0'",
    '        version: 1.0.0',
    'packages:',
    '  dep@1.0.0: {}',
    'snapshots:',
    '  dep@1.0.0: {}',
    '',
  ].join('\n');
}

/*** Build the minimum Yarn Berry lock fixture used by PnP safety tests. */
function yarnLock(): string {
  return [
    '__metadata:',
    '  version: 8',
    '"dep@npm:^1.0.0":',
    '  version: 1.0.0',
    '  resolution: "dep@npm:1.0.0"',
    '',
  ].join('\n');
}

/*** Build the minimum npm package-lock fixture used by selection tests. */
function npmLock(packages: Readonly<Record<string, string>>): unknown {
  return {
    name: 'fixture',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'fixture',
        dependencies: Object.fromEntries(Object.keys(packages).map((name) => [name, '^1.0.0'])),
      },
      ...Object.fromEntries(
        Object.entries(packages).map(([name, version]) => [
          `node_modules/${name}`,
          { name, version },
        ]),
      ),
    },
  };
}

/*** Build npm lock evidence with two physical versions of the same transitive package. */
function duplicateNpmLock(): unknown {
  return {
    name: 'fixture',
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture', dependencies: { parent: '^1.0.0' } },
      'node_modules/dep': { name: 'dep', version: '1.0.0' },
      'node_modules/parent': {
        name: 'parent',
        version: '1.0.0',
        dependencies: { dep: '^2.0.0' },
      },
      'node_modules/parent/node_modules/dep': { name: 'dep', version: '2.0.0' },
    },
  };
}

/*** Build Project Detector evidence without coupling adapter tests to filesystem scanning. */
function createInspection(
  rootPath: string,
  manifests: readonly string[],
  packageManagers: readonly string[],
): ProjectInspection {
  const detection = {
    traits: new Set(['javascript']),
    languages: [{ id: 'javascript', score: 1, evidence: ['package.json'], sourceRoots: ['.'] }],
    packageManagers,
    buildTools: [],
    findings: [],
    diagnostics: [],
  };
  return {
    rootPath,
    complete: true,
    detection,
    packages: manifests.map((manifestPath) => ({
      rootPath:
        path.dirname(manifestPath) === '.'
          ? '.'
          : path.dirname(manifestPath).split(path.sep).join('/'),
      manifestPath,
      detection,
    })),
    workspaces: [],
    manifests,
    diagnostics: [],
  };
}

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { inspectProjectAsync } from '@ankhorage/project-detector/node';
import { expect, test } from 'bun:test';

import { inspectDependencyInventoryAsync } from '../../../../nodeApm.js';

test('retains scoped nested Bun instances, nearest edges and exact installed locations', async () => {
  await withFixtureAsync(async (root) => {
    await writeFixtureAsync(root, {
      dep: ['dep@1.0.0', '', {}],
      '@vendor/parent': [
        '@vendor/parent@1.0.0',
        '',
        { dependencies: { dep: '^2.0.0', child: '*' } },
      ],
      '@vendor/parent/dep': ['dep@2.0.0', '', {}],
      '@vendor/parent/child': [
        'child@1.0.0',
        '',
        { dependencies: { dep: '^2.0.0', '@scope/leaf': '*' } },
      ],
      '@scope/leaf': ['@scope/leaf@1.0.0', '', {}],
    });
    await installAsync(root, 'node_modules/dep', 'dep', '1.0.0');
    await installAsync(root, 'node_modules/@vendor/parent', '@vendor/parent', '1.0.0');
    await installAsync(root, 'node_modules/@vendor/parent/node_modules/dep', 'dep', '2.0.0');
    await installAsync(root, 'node_modules/@vendor/parent/node_modules/child', 'child', '1.0.0');
    await installAsync(root, 'node_modules/@scope/leaf', '@scope/leaf', '1.0.0');
    const before = await readFile(path.join(root, 'bun.lock'), 'utf8');
    const inventory = await inspectAsync(root);
    const [evidence] = inventory.roots;
    expect(inventory.complete).toBe(true);
    expect(
      evidence?.installedPackages.map(({ packageId, version }) => [packageId, version]),
    ).toEqual([
      ['bun:dep', '1.0.0'],
      ['bun:@vendor/parent', '1.0.0'],
      ['bun:@vendor/parent/dep', '2.0.0'],
      ['bun:@vendor/parent/child', '1.0.0'],
      ['bun:@scope/leaf', '1.0.0'],
    ]);
    const parent = evidence?.lockedPackages.find(({ id }) => id === 'bun:@vendor/parent');
    const child = evidence?.lockedPackages.find(({ id }) => id === 'bun:@vendor/parent/child');
    expect(parent?.dependencies[0]?.packageId).toBe('bun:@vendor/parent/dep');
    expect(child?.dependencies.map(({ packageId }) => packageId)).toEqual([
      'bun:@vendor/parent/dep',
      'bun:@scope/leaf',
    ]);
    expect(evidence?.declarations.find(({ name }) => name === 'dep')?.resolvedPackageId).toBe(
      'bun:dep',
    );
    expect(await readFile(path.join(root, 'bun.lock'), 'utf8')).toBe(before);
  });
});

test('never uses a top-level duplicate to hide a missing nested Bun instance', async () => {
  await withFixtureAsync(async (root) => {
    await writeFixtureAsync(root, {
      dep: ['dep@1.0.0', '', {}],
      '@vendor/parent': ['@vendor/parent@1.0.0', '', { dependencies: { dep: '^2.0.0' } }],
      '@vendor/parent/dep': ['dep@2.0.0', '', {}],
    });
    await installAsync(root, 'node_modules/dep', 'dep', '1.0.0');
    await installAsync(root, 'node_modules/@vendor/parent', '@vendor/parent', '1.0.0');
    const result = await inspectAsync(root);
    expect(result.complete).toBe(true);
    expect(
      result.roots[0]?.installedPackages.find(
        ({ packageId }) => packageId === 'bun:@vendor/parent/dep',
      )?.state,
    ).toBe('absent');
  });
});

test('reports mismatched installed Bun versions and names instead of accepting a convenient instance', async () => {
  await withFixtureAsync(async (root) => {
    await writeFixtureAsync(root, { dep: ['dep@1.0.0', '', {}] });
    await installAsync(root, 'node_modules/dep', 'dep', '2.0.0');
    const wrongVersion = await inspectAsync(root);
    expect(wrongVersion.complete).toBe(false);
    expect(wrongVersion.roots[0]?.installedPackages[0]?.version).toBe('2.0.0');
    await installAsync(root, 'node_modules/dep', 'other', '1.0.0');
    const wrongName = await inspectAsync(root);
    expect(wrongName.complete).toBe(false);
    expect(wrongName.roots[0]?.installedPackages[0]?.state).toBe('unknown');
  });
});

test('rejects unsafe or malformed Bun lock placements without reading outside the project', async () => {
  await withFixtureAsync(async (root) => {
    for (const key of [
      '../dep',
      '/dep',
      'parent//dep',
      '@scope',
      'parent/../../dep',
      'C:\\dep',
      'parent/./dep',
    ]) {
      await writeFixtureAsync(root, { [key]: ['dep@1.0.0', '', {}] });
      const result = await inspectAsync(root);
      expect(result.complete).toBe(false);
      expect(
        result.diagnostics.some(({ code }) => code === 'status.lockfile.bun.invalid-instance'),
      ).toBe(true);
    }
    await writeFixtureAsync(root, { dep: ['dep@not-semver', '', {}] });
    expect((await inspectAsync(root)).complete).toBe(false);
  });
});

test('does not guess a nested package as an unresolved root dependency', async () => {
  await withFixtureAsync(async (root) => {
    await writeFixtureAsync(root, {
      '@vendor/parent': ['@vendor/parent@1.0.0', '', { dependencies: { dep: '^1.0.0' } }],
      '@vendor/parent/dep': ['dep@1.0.0', '', {}],
    });
    const result = await inspectAsync(root);
    expect(
      result.roots[0]?.declarations.find(({ name }) => name === 'dep')?.resolvedPackageId,
    ).toBeUndefined();
  });
});

/*** Exercise the Node inventory boundary with the published detector and a real isolated filesystem. */
async function inspectAsync(root: string) {
  return inspectDependencyInventoryAsync({ inspection: await inspectProjectAsync(root) });
}

/*** Create deterministic Bun text-lock v2 data independently from the implementation being tested. */
async function writeFixtureAsync(
  root: string,
  packages: Readonly<Record<string, unknown>>,
): Promise<void> {
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      packageManager: 'bun@1.4.2',
      dependencies: { dep: '^1.0.0', '@vendor/parent': '^1.0.0' },
    }),
  );
  await writeFile(
    path.join(root, 'bun.lock'),
    JSON.stringify({ lockfileVersion: 2, configVersion: 1, packages }),
  );
}

/*** Write a data-only installed package manifest at a manually specified expected physical location. */
async function installAsync(
  root: string,
  location: string,
  name: string,
  version: string,
): Promise<void> {
  await mkdir(path.join(root, location), { recursive: true });
  await writeFile(path.join(root, location, 'package.json'), JSON.stringify({ name, version }));
}

/*** Keep all filesystem state test-local and remove it on failures as well as success. */
async function withFixtureAsync(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'apm-bun-placement-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('resolves workspace-owned declarations from the workspace placement before the root', async () => {
  await withFixtureAsync(async (root) => {
    await writeFixtureAsync(root, {
      dep: ['dep@1.0.0', '', {}],
      '@workspace/child': ['@workspace/child@workspace:packages/child', {}],
      '@workspace/child/dep': ['dep@2.0.0', '', {}],
    });
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        packageManager: 'bun@1.4.2',
        workspaces: ['packages/*'],
        dependencies: { dep: '^1.0.0' },
      }),
    );
    await mkdir(path.join(root, 'packages/child'), { recursive: true });
    await writeFile(
      path.join(root, 'packages/child/package.json'),
      JSON.stringify({ name: '@workspace/child', dependencies: { dep: '^2.0.0' } }),
    );
    const result = await inspectAsync(root);
    expect(result.complete).toBe(true);
    expect(result.roots.length).toBe(1);
    expect(
      result.roots[0]?.declarations.map(({ ownerPath, resolvedPackageId }) => [
        ownerPath,
        resolvedPackageId,
      ]),
    ).toContainEqual(['packages/child/package.json', 'bun:@workspace/child/dep']);
  });
});

test('keeps multiple isolated Bun peer variants unknown without guessing an installed instance', async () => {
  await withFixtureAsync(async (root) => {
    await writeFixtureAsync(root, { dep: ['dep@1.0.0', '', {}] });
    await installAsync(
      root,
      'node_modules/.bun/dep@1.0.0+peer-one/node_modules/dep',
      'dep',
      '1.0.0',
    );
    await installAsync(
      root,
      'node_modules/.bun/dep@1.0.0+peer-two/node_modules/dep',
      'dep',
      '1.0.0',
    );
    const result = await inspectAsync(root);
    expect(result.complete).toBe(false);
    expect(result.roots[0]?.installedPackages[0]?.state).toBe('unknown');
  });
});

test('retains local Bun tarball identity and its compact dependency tuple without reading the archive', async () => {
  await withFixtureAsync(async (root) => {
    await writeFixtureAsync(root, {
      dep: [
        'dep@/nonexistent/owner+candidate.tgz',
        { dependencies: { leaf: '^2.0.0' } },
        'sha512-fixture',
      ],
      leaf: ['leaf@1.0.0', '', {}],
      'dep/leaf': ['leaf@2.0.0', '', {}],
    });
    await installAsync(root, 'node_modules/dep', 'dep', '3.0.0');
    await installAsync(root, 'node_modules/leaf', 'leaf', '1.0.0');
    await installAsync(root, 'node_modules/dep/node_modules/leaf', 'leaf', '2.0.0');
    const result = await inspectAsync(root);
    const owner = result.roots[0]?.lockedPackages.find(({ id }) => id === 'bun:dep');
    expect(result.complete).toBe(true);
    expect(owner?.source).toBe('file');
    expect(owner?.version).toBeUndefined();
    expect(owner?.peerContext).toBeUndefined();
    expect(owner?.dependencies[0]?.packageId).toBe('bun:dep/leaf');
    expect(
      result.roots[0]?.installedPackages.find(({ packageId }) => packageId === 'bun:dep')?.version,
    ).toBe('3.0.0');
  });
});

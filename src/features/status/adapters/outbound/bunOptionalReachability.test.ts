import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { inspectProjectAsync } from '@ankhorage/project-detector/node';
import { expect, test } from 'bun:test';

import { inspectDependencyInventoryAsync } from '../../../../nodeApm.js';
import type {
  ApmDependencyInventory,
  ApmInstalledPackageEvidence,
  ApmLockedPackageEvidence,
} from '../../../../types/status.js';
import { evaluateDependencyFindings } from '../../domain/evaluateDependencyFindings.js';

test('preserves optional-only Bun dependency paths while required reachability wins', async () => {
  await withFixtureAsync(async (root) => {
    await writeFixtureAsync(root);
    const inventory = await inspectDependencyInventoryAsync({
      inspection: await inspectProjectAsync(root),
    });

    expect(inventory.complete).toBe(true);
    for (const name of ['parent', 'required', 'shared']) {
      expect(packageByName(inventory, name).optional).toBe(false);
    }
    for (const name of ['optional-child', 'optional-leaf', 'optional-direct', 'direct-leaf']) {
      expect(packageByName(inventory, name).optional).toBe(true);
    }

    expect(findingCodes(inventory, 'bun:shared')).toContain('install-absent');
    expect(findingCodes(inventory, 'bun:optional-child')).not.toContain('install-absent');
    expect(findingCodes(inventory, 'bun:optional-leaf')).not.toContain('install-absent');
    expect(findingCodes(inventory, 'bun:optional-direct')).not.toContain('install-absent');
    expect(findingCodes(inventory, 'bun:direct-leaf')).not.toContain('install-absent');
  });
});

/*** Write a Bun graph with optional-only subtrees plus one package reached by both optional and required paths. */
async function writeFixtureAsync(root: string): Promise<void> {
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      packageManager: 'bun@1.4.2',
      dependencies: { parent: '^1.0.0', required: '^1.0.0' },
      optionalDependencies: { 'optional-direct': '^1.0.0' },
    }),
  );
  await writeFile(
    path.join(root, 'bun.lock'),
    JSON.stringify({
      lockfileVersion: 2,
      configVersion: 1,
      packages: {
        parent: [
          'parent@1.0.0',
          '',
          { optionalDependencies: { 'optional-child': '^1.0.0', shared: '^1.0.0' } },
        ],
        required: ['required@1.0.0', '', { dependencies: { shared: '^1.0.0' } }],
        shared: ['shared@1.0.0', '', {}],
        'optional-child': [
          'optional-child@1.0.0',
          '',
          { dependencies: { 'optional-leaf': '^1.0.0' } },
        ],
        'optional-leaf': ['optional-leaf@1.0.0', '', {}],
        'optional-direct': [
          'optional-direct@1.0.0',
          '',
          { dependencies: { 'direct-leaf': '^1.0.0' } },
        ],
        'direct-leaf': ['direct-leaf@1.0.0', '', {}],
      },
    }),
  );
}

/*** Resolve one locked package by package name from the single-root fixture. */
function packageByName(inventory: ApmDependencyInventory, name: string): ApmLockedPackageEvidence {
  const pkg = inventory.roots[0]?.lockedPackages.find((candidate) => candidate.name === name);
  if (pkg === undefined) throw new Error(`Expected locked package ${name}.`);
  return pkg;
}

/*** Resolve one installed-state observation by lock package id. */
function installedById(
  inventory: ApmDependencyInventory,
  packageId: string,
): ApmInstalledPackageEvidence {
  const installed = inventory.roots[0]?.installedPackages.find(
    (candidate) => candidate.packageId === packageId,
  );
  if (installed === undefined) throw new Error(`Expected installed evidence ${packageId}.`);
  return installed;
}

/*** Evaluate install finding codes using the same status-domain boundary as production status. */
function findingCodes(inventory: ApmDependencyInventory, packageId: string): readonly string[] {
  const pkg = inventory.roots[0]?.lockedPackages.find((candidate) => candidate.id === packageId);
  if (pkg === undefined) throw new Error(`Expected locked evidence ${packageId}.`);
  return evaluateDependencyFindings({
    packageId: `root::${packageId}`,
    pkg,
    installed: installedById(inventory, packageId),
    availability: { packageId, name: pkg.name, state: 'not-applicable' },
  }).map(({ code }) => code);
}

/*** Keep filesystem evidence isolated and remove it after success or failure. */
async function withFixtureAsync(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'apm-bun-optional-reachability-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

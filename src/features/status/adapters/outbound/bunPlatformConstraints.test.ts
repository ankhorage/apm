import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { inspectProjectAsync } from '@ankhorage/project-detector/node';
import { expect, test } from 'bun:test';

import { inspectDependencyInventoryAsync } from '../../../../nodeApm.js';
import type {
  ApmDependencyInventory,
  ApmInstalledPackageEvidence,
  ApmLockedPackageEvidence,
} from '../../../../types/status.js';
import { evaluateDependencyFindings } from '../../domain/evaluateDependencyFindings.js';

test('allows absent Bun packages excluded by current host constraints while requiring applicable packages', async () => {
  await withFixtureAsync(runPlatformConstraintCaseAsync);
});

/*** Exercise required and host-excluded Bun lock entries through the real inventory boundary. */
async function runPlatformConstraintCaseAsync(root: string): Promise<void> {
  await writePlatformFixtureAsync(root);
  const inventory = await inspectDependencyInventoryAsync({
    inspection: await inspectProjectAsync(root),
  });
  const [installRoot] = inventory.roots;
  if (installRoot === undefined) throw new Error('Expected Bun platform fixture install root.');
  const required = findLockedPackage(inventory, 'required');
  const excluded = findLockedPackage(inventory, 'excluded-by-os');
  const requiredInstalled = findInstalledPackage(inventory, 'bun:required');
  const excludedInstalled = findInstalledPackage(inventory, 'bun:excluded-by-os');

  expect(required.optional).toBe(false);
  expect(excluded.optional).toBe(true);
  expect(requiredInstalled.state).toBe('absent');
  expect(excludedInstalled.state).toBe('absent');
  expect(findingCodes('root::bun:required', required, requiredInstalled)).toContain(
    'install-absent',
  );
  expect(findingCodes('root::bun:excluded-by-os', excluded, excludedInstalled)).not.toContain(
    'install-absent',
  );
}

/*** Write Bun lock evidence with one applicable and one current-host-excluded package. */
async function writePlatformFixtureAsync(root: string): Promise<void> {
  const excludedOs = process.platform === 'darwin' ? 'linux' : 'darwin';
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      packageManager: 'bun@1.4.2',
      dependencies: { required: '^1.0.0', 'excluded-by-os': '^1.0.0' },
    }),
  );
  await writeFile(
    path.join(root, 'bun.lock'),
    JSON.stringify({
      lockfileVersion: 2,
      configVersion: 1,
      packages: {
        required: ['required@1.0.0', '', { os: process.platform, cpu: process.arch }],
        'excluded-by-os': ['excluded-by-os@1.0.0', '', { os: excludedOs }],
      },
    }),
  );
}

/*** Resolve one locked package from the single-root platform fixture. */
function findLockedPackage(
  inventory: ApmDependencyInventory,
  name: string,
): ApmLockedPackageEvidence {
  const [root] = inventory.roots;
  const pkg = root?.lockedPackages.find((candidate) => candidate.name === name);
  if (pkg === undefined) throw new Error(`Expected locked package ${name}.`);
  return pkg;
}

/*** Resolve one installed-state observation from the single-root platform fixture. */
function findInstalledPackage(
  inventory: ApmDependencyInventory,
  packageId: string,
): ApmInstalledPackageEvidence {
  const [root] = inventory.roots;
  const installed = root?.installedPackages.find((candidate) => candidate.packageId === packageId);
  if (installed === undefined) throw new Error(`Expected installed evidence ${packageId}.`);
  return installed;
}

/*** Evaluate status finding codes for one locked/installed package pair. */
function findingCodes(
  packageId: string,
  pkg: ApmLockedPackageEvidence,
  installed: ApmInstalledPackageEvidence,
): readonly string[] {
  return evaluateDependencyFindings({
    packageId,
    pkg,
    installed,
    availability: { packageId, name: pkg.name, state: 'not-applicable' },
  }).map(({ code }) => code);
}

/*** Keep filesystem evidence isolated and remove it after every platform-constraint regression. */
async function withFixtureAsync(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'apm-bun-platform-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

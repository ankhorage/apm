import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { pathExists } from '@ankhorage/utility/node/fs';

import type {
  ApmInstalledPackageEvidence,
  ApmLockedPackageEvidence,
} from '../../../../types/status.js';
import type {
  ApmManagerInspectionInput,
  ApmManagerInstallationEvidence,
} from '../../../../types/status-inventory.js';
import { readInstalledPackageVersionAsync } from '../../utils/readInstalledPackageVersionAsync.js';

/*** Inspect Bun isolated-store or hoisted node_modules installation evidence. */
export async function inspectBunInstallationAsync(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): Promise<ApmManagerInstallationEvidence> {
  const isolatedStore = path.join(input.root.rootPath, 'node_modules', '.bun');
  const isolated = await pathExists(isolatedStore);
  const installedPackages = isolated
    ? await inspectIsolatedAsync(input, packages, isolatedStore)
    : await inspectHoistedAsync(input, packages);
  const mismatched = installedPackages.filter((item) => {
    const locked = packages.find((pkg) => pkg.id === item.packageId);
    return (
      item.state === 'present' && locked?.version !== undefined && item.version !== locked.version
    );
  });
  const complete =
    installedPackages.every((item) => item.state !== 'unknown') && mismatched.length === 0;
  return {
    linker: isolated ? 'isolated' : 'hoisted',
    installedPackages,
    complete,
    diagnostics: complete
      ? []
      : [
          {
            code: 'status.install.bun.instance-unknown',
            severity: 'warning',
            scope: { kind: 'install-root', id: input.root.id },
            evidence: [
              isolated ? 'node_modules/.bun' : 'node_modules',
              ...mismatched.map(
                (item) => `${item.packageId}: installed ${item.version ?? 'unknown'}`,
              ),
            ],
            reason:
              'At least one Bun lock instance is unknown or differs from its installed package data.',
          },
        ],
  };
}

/*** Confirm Bun isolated instances from `.bun/name@version/node_modules/name` store paths. */
async function inspectIsolatedAsync(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
  storePath: string,
): Promise<readonly ApmInstalledPackageEvidence[]> {
  const entries = await readdir(storePath).catch(() => [] as string[]);
  return Promise.all(packages.map((pkg) => inspectIsolatedPackageAsync(input, pkg, entries)));
}

/*** Inspect one Bun isolated store instance without following executable package entrypoints. */
function inspectIsolatedPackageAsync(
  input: ApmManagerInspectionInput,
  pkg: ApmLockedPackageEvidence,
  entries: readonly string[],
): Promise<ApmInstalledPackageEvidence> {
  if (pkg.source !== 'registry' || pkg.version === undefined)
    return readDirectLinkAsync(input, pkg);
  const prefix = `${bunStorePackageName(pkg.name)}@${pkg.version}`;
  const candidates = entries.filter((entry) => entry === prefix || entry.startsWith(`${prefix}+`));
  const [onlyCandidate] = candidates;
  if (candidates.length !== 1 || onlyCandidate === undefined) {
    return Promise.resolve(
      candidates.length === 0
        ? {
            packageId: pkg.id,
            state: 'absent',
            source: 'bun-store',
            reason: 'Bun isolated store entry is absent.',
          }
        : {
            packageId: pkg.id,
            state: 'unknown',
            source: 'bun-store',
            reason: 'Multiple Bun peer variants match this lock instance.',
          },
    );
  }
  const location = `node_modules/.bun/${onlyCandidate}/node_modules/${pkg.name}`;
  return readInstalledPackageVersionAsync({
    packageId: pkg.id,
    packagePath: path.join(input.root.rootPath, ...location.split('/')),
    source: 'bun-store',
    serializedLocation: location,
  });
}

/*** Read each hoisted instance at the exact placement represented by its Bun lock key. */
async function inspectHoistedAsync(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): Promise<readonly ApmInstalledPackageEvidence[]> {
  return Promise.all(
    packages.map((pkg) =>
      pkg.location === undefined
        ? Promise.resolve({
            packageId: pkg.id,
            state: 'unknown' as const,
            source: 'node-modules' as const,
            reason: 'Bun lock instance has no validated physical placement.',
          })
        : readInstalledPackageVersionAsync({
            packageId: pkg.id,
            packagePath: path.join(input.root.rootPath, pkg.location),
            source: 'node-modules',
            serializedLocation: pkg.location,
            expectedName: pkg.name,
          }),
    ),
  );
}

/*** Read the top-level Bun package link for direct or uniquely hoisted evidence. */
function readDirectLinkAsync(
  input: ApmManagerInspectionInput,
  pkg: ApmLockedPackageEvidence,
): Promise<ApmInstalledPackageEvidence> {
  return readInstalledPackageVersionAsync({
    packageId: pkg.id,
    packagePath: path.join(input.root.rootPath, 'node_modules', ...pkg.name.split('/')),
    source: 'node-modules',
    serializedLocation: `node_modules/${pkg.name}`,
  });
}

/*** Encode scoped package names using Bun's plus-sign isolated-store naming. */
function bunStorePackageName(name: string): string {
  return name.startsWith('@') ? name.replace('/', '+') : name;
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { pathExists } from '@ankhorage/utility/node/fs';
import { isRecord } from '@ankhorage/utility/object';
import { parseAllDocuments } from 'yaml';

import type {
  ApmManagerInspectionInput,
  ApmManagerInstallationEvidence,
} from '../../../../types/status-inventory.js';
import type { ApmInstalledPackageEvidence, ApmLockedPackageEvidence } from '../../../../types/status.js';
import { readInstalledPackageVersionAsync } from '../../utils/readInstalledPackageVersionAsync.js';

/*** Inspect pnpm installation state from node_modules and the virtual-store installation lock. */
export async function inspectPnpmInstallationAsync(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): Promise<ApmManagerInstallationEvidence> {
  const nodeModules = path.join(input.root.rootPath, 'node_modules');
  if (!(await pathExists(nodeModules))) return absentInstallation(packages);
  const virtualLockPath = path.join(nodeModules, '.pnpm', 'lock.yaml');
  if (!(await pathExists(virtualLockPath))) return missingVirtualLock(input, packages);

  const installedText = await readFile(virtualLockPath, 'utf8');
  const installedKeys = collectPnpmKeys(installedText);
  const installedPackages = await Promise.all(
    packages.map((pkg) => inspectPackageAsync(input, pkg, installedKeys)),
  );
  return {
    linker: 'virtual-store',
    installedPackages,
    complete: true,
    diagnostics: [],
  };
}

/*** Inspect one workspace link or registry instance against pnpm installation evidence. */
function inspectPackageAsync(
  input: ApmManagerInspectionInput,
  pkg: ApmLockedPackageEvidence,
  installedKeys: ReadonlySet<string>,
): Promise<ApmInstalledPackageEvidence> {
  if (pkg.source === 'workspace') {
    return readInstalledPackageVersionAsync({
      packageId: pkg.id,
      packagePath: path.join(input.root.rootPath, 'node_modules', ...pkg.name.split('/')),
      source: 'pnpm-store',
      serializedLocation: `node_modules/${pkg.name}`,
    });
  }
  const nativeKey = pkg.id.startsWith('pnpm:') ? pkg.id.slice('pnpm:'.length) : pkg.id;
  return Promise.resolve(
    installedKeys.has(nativeKey)
      ? {
          packageId: pkg.id,
          state: 'present',
          source: 'pnpm-store',
          ...(pkg.version === undefined ? {} : { version: pkg.version }),
          location: 'node_modules/.pnpm',
        }
      : {
          packageId: pkg.id,
          state: 'absent',
          source: 'pnpm-store',
          reason: 'Package instance is absent from node_modules/.pnpm/lock.yaml.',
        },
  );
}

/*** Treat a missing node_modules tree as complete absence evidence for every locked instance. */
function absentInstallation(
  packages: readonly ApmLockedPackageEvidence[],
): ApmManagerInstallationEvidence {
  return {
    linker: 'virtual-store',
    installedPackages: packages.map((pkg) => ({
      packageId: pkg.id,
      state: 'absent',
      source: 'pnpm-store',
      reason: 'node_modules is absent.',
    })),
    complete: true,
    diagnostics: [],
  };
}

/*** Report node_modules without pnpm virtual-store lock evidence as incomplete installed state. */
function missingVirtualLock(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): ApmManagerInstallationEvidence {
  return {
    linker: 'virtual-store',
    installedPackages: packages.map((pkg) => ({
      packageId: pkg.id,
      state: 'unknown',
      source: 'pnpm-store',
      reason: 'pnpm virtual-store lock evidence is absent.',
    })),
    complete: false,
    diagnostics: [{
      code: 'status.install.pnpm.virtual-lock-missing',
      severity: 'warning',
      scope: { kind: 'install-root', id: input.root.id },
      evidence: ['node_modules/.pnpm/lock.yaml'],
      reason: 'node_modules exists but pnpm virtual-store lock evidence is unavailable.',
      nextAction: 'Run a supported pnpm install before treating installed state as complete.',
    }],
  };
}

/*** Collect package and snapshot identities from every valid pnpm installation-lock document. */
function collectPnpmKeys(text: string): ReadonlySet<string> {
  const keys = parseAllDocuments(text)
    .filter((document) => document.errors.length === 0)
    .map((document) => document.toJS() as unknown)
    .flatMap((value) => {
      if (!isRecord(value)) return [];
      return [
        ...(isRecord(value.packages) ? Object.keys(value.packages) : []),
        ...(isRecord(value.snapshots) ? Object.keys(value.snapshots) : []),
      ];
    });
  return new Set(keys);
}

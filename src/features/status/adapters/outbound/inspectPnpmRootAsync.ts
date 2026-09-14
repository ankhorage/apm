import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { pathExists } from '@ankhorage/utility/node/fs';
import { isRecord } from '@ankhorage/utility/object';
import { parse as parseYaml } from 'yaml';

import type { ApmManagerInspectionInput, ApmManagerInspectionResult } from '../../../types/status-inventory.js';
import type { ApmInstalledPackageEvidence, ApmLockedPackageEvidence, ApmStatusDiagnostic } from '../../../types/status.js';
import { declarationResolutionKey } from '../utils/declarationResolutionKey.js';
import { readInstalledPackageVersionAsync } from '../utils/readInstalledPackageVersionAsync.js';

/*** Inspect pnpm v9 importer/package/snapshot evidence and the virtual-store installation lock. */
export async function inspectPnpmRootAsync(input: ApmManagerInspectionInput): Promise<ApmManagerInspectionResult> {
  const candidate = input.root.lockfileCandidates.find((item) => item.manager === 'pnpm');
  if (candidate === undefined) return missingPnpmLock(input.root.id);
  const parsed = parseYaml(await readFile(path.join(input.root.rootPath, 'pnpm-lock.yaml'), 'utf8')) as unknown;
  if (!isRecord(parsed) || String(parsed.lockfileVersion) !== '9.0' || !isRecord(parsed.importers)) {
    return unsupportedPnpmLock(input.root.id, candidate.path, parsed);
  }
  const packages = isRecord(parsed.packages) ? parsed.packages : {};
  const snapshots = isRecord(parsed.snapshots) ? parsed.snapshots : {};
  const registryPackages = Object.entries(packages).flatMap(([key, value]) => {
    const identity = parsePnpmPackageKey(key);
    if (identity === undefined || !isRecord(value)) return [];
    const snapshot = isRecord(snapshots[key]) ? snapshots[key] : {};
    return [toLockedPnpmPackage(key, identity, snapshot, packages)];
  });
  const workspacePackages = readWorkspacePackages(parsed.importers, input);
  const lockedPackages = [...registryPackages, ...workspacePackages.packages];
  const directResolutions = readPnpmDirectResolutions(parsed.importers, input, lockedPackages);
  const installation = await inspectPnpmInstallationAsync(input, lockedPackages);
  return {
    linker: 'virtual-store',
    lockfile: {
      state: 'supported',
      path: candidate.path,
      format: 'pnpm-lock',
      version: '9.0',
      evidence: [candidate.path],
    },
    lockedPackages,
    installedPackages: installation.packages,
    directResolutions,
    complete: installation.complete,
    diagnostics: installation.diagnostics,
  };
}

interface PnpmIdentity {
  readonly name: string;
  readonly version: string;
  readonly peerContext?: string;
}

/*** Parse pnpm's package key while retaining peer-context suffixes in the native instance ID. */
function parsePnpmPackageKey(key: string): PnpmIdentity | undefined {
  const normalized = key.startsWith('/') ? key.slice(1) : key;
  const match = /^(@[^/]+\/[^@]+|[^@]+)@(.+)$/u.exec(normalized);
  if (match === null) return undefined;
  const rawVersion = match[2];
  const peerIndex = rawVersion.indexOf('(');
  return {
    name: match[1],
    version: peerIndex < 0 ? rawVersion : rawVersion.slice(0, peerIndex),
    ...(peerIndex < 0 ? {} : { peerContext: rawVersion.slice(peerIndex) }),
  };
}

/*** Convert one pnpm package/snapshot pair into a lock graph node. */
function toLockedPnpmPackage(
  key: string,
  identity: PnpmIdentity,
  snapshot: Record<string, unknown>,
  packages: Record<string, unknown>,
): ApmLockedPackageEvidence {
  const dependencies = [
    ...readStringMap(snapshot.dependencies),
    ...readStringMap(snapshot.optionalDependencies),
  ].map(([name, requested]) => ({
    name,
    requested,
    ...optionalId(resolvePnpmPackageId(name, requested, packages)),
  }));
  return {
    id: `pnpm:${key}`,
    name: identity.name,
    version: identity.version,
    source: 'registry',
    optional: false,
    ...(identity.peerContext === undefined ? {} : { peerContext: identity.peerContext }),
    dependencies,
  };
}

/*** Materialize pnpm workspace link references as package instances instead of promoting them to roots. */
function readWorkspacePackages(
  importers: Record<string, unknown>,
  input: ApmManagerInspectionInput,
): { readonly packages: readonly ApmLockedPackageEvidence[] } {
  const packages = new Map<string, ApmLockedPackageEvidence>();
  for (const [importerPath, importerValue] of Object.entries(importers)) {
    if (!isRecord(importerValue)) continue;
    for (const [name, value] of readImporterDependencies(importerValue)) {
      const reference = readPnpmImporterVersion(value);
      if (reference === undefined || (!reference.startsWith('link:') && !reference.startsWith('workspace:'))) continue;
      const target = reference.replace(/^(?:link:|workspace:)/u, '');
      const id = `pnpm:workspace:${importerPath}:${name}:${target}`;
      packages.set(id, {
        id,
        name,
        source: 'workspace',
        optional: false,
        location: target,
        dependencies: [],
      });
    }
  }
  return { packages: [...packages.values()] };
}

/*** Map package.json declarations to pnpm importer resolutions without collapsing duplicate instances. */
function readPnpmDirectResolutions(
  importers: Record<string, unknown>,
  input: ApmManagerInspectionInput,
  lockedPackages: readonly ApmLockedPackageEvidence[],
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const manifest of input.root.manifests) {
    const importerPath = portableRelative(input.root.rootPath, manifest.packageRoot);
    const importer = isRecord(importers[importerPath]) ? importers[importerPath] : undefined;
    if (importer === undefined) continue;
    const dependencyEntries = new Map(readImporterDependencies(importer));
    for (const name of declaredNames(manifest)) {
      const reference = readPnpmImporterVersion(dependencyEntries.get(name));
      if (reference === undefined) continue;
      const resolved = reference.startsWith('link:') || reference.startsWith('workspace:')
        ? lockedPackages.find((pkg) => pkg.source === 'workspace' && pkg.name === name && pkg.id.includes(`${importerPath}:${name}:`))?.id
        : lockedPackages.find(
            (pkg) => pkg.name === name && (pkg.version === reference || pkg.id.includes(`${name}@${reference}`)),
          )?.id;
      if (resolved !== undefined) {
        result.set(declarationResolutionKey(manifest.manifestPath, name), resolved);
      }
    }
  }
  return result;
}

/*** Inspect pnpm's installation lock rather than inferring installed state from the desired lockfile. */
async function inspectPnpmInstallationAsync(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): Promise<PnpmInstallationResult> {
  const nodeModules = path.join(input.root.rootPath, 'node_modules');
  if (!(await pathExists(nodeModules))) {
    return {
      complete: true,
      packages: packages.map((pkg) => ({
        packageId: pkg.id,
        state: 'absent',
        source: 'pnpm-store',
        reason: 'node_modules is absent.',
      })),
      diagnostics: [],
    };
  }
  const virtualLockPath = path.join(nodeModules, '.pnpm', 'lock.yaml');
  if (!(await pathExists(virtualLockPath))) {
    return {
      complete: false,
      packages: packages.map((pkg) => ({
        packageId: pkg.id,
        state: 'unknown',
        source: 'pnpm-store',
        reason: 'pnpm virtual-store lock evidence is absent.',
      })),
      diagnostics: [
        {
          code: 'status.install.pnpm.virtual-lock-missing',
          severity: 'warning',
          scope: { kind: 'install-root', id: input.root.id },
          evidence: ['node_modules/.pnpm/lock.yaml'],
          reason: 'node_modules exists but pnpm virtual-store lock evidence is unavailable.',
          nextAction: 'Run a supported pnpm install before treating installed state as complete.',
        },
      ],
    };
  }
  const installed = parseYaml(await readFile(virtualLockPath, 'utf8')) as unknown;
  const installedKeys = collectPnpmKeys(installed);
  const evidence = await Promise.all(
    packages.map(async (pkg): Promise<ApmInstalledPackageEvidence> => {
      if (pkg.source === 'workspace') {
        return readInstalledPackageVersionAsync({
          packageId: pkg.id,
          packagePath: path.join(input.root.rootPath, 'node_modules', pkg.name),
          source: 'pnpm-store',
          serializedLocation: `node_modules/${pkg.name}`,
        });
      }
      const nativeKey = pkg.id.slice('pnpm:'.length);
      return installedKeys.has(nativeKey)
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
          };
    }),
  );
  return { complete: true, packages: evidence, diagnostics: [] };
}

interface PnpmInstallationResult {
  readonly complete: boolean;
  readonly packages: readonly ApmInstalledPackageEvidence[];
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

/*** Collect desired/installed pnpm package identities from v9 package and snapshot tables. */
function collectPnpmKeys(value: unknown): ReadonlySet<string> {
  if (!isRecord(value)) return new Set();
  return new Set([
    ...(isRecord(value.packages) ? Object.keys(value.packages) : []),
    ...(isRecord(value.snapshots) ? Object.keys(value.snapshots) : []),
  ]);
}

/*** Read all pnpm importer dependency groups while keeping the raw resolution object. */
function readImporterDependencies(importer: Record<string, unknown>): readonly [string, unknown][] {
  return ['dependencies', 'devDependencies', 'optionalDependencies'].flatMap((key) =>
    isRecord(importer[key]) ? Object.entries(importer[key]) : [],
  );
}

/*** Extract the resolved pnpm importer reference from either scalar or object form. */
function readPnpmImporterVersion(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return isRecord(value) && typeof value.version === 'string' ? value.version : undefined;
}

/*** Resolve a pnpm dependency edge by package name plus version/peer-context prefix. */
function resolvePnpmPackageId(
  name: string,
  reference: string,
  packages: Record<string, unknown>,
): string | undefined {
  const keys = Object.keys(packages).filter((key) => {
    const normalized = key.startsWith('/') ? key.slice(1) : key;
    return normalized === `${name}@${reference}` || normalized.startsWith(`${name}@${reference}(`);
  });
  return keys.length === 1 ? `pnpm:${keys[0]}` : undefined;
}

/*** Read string-valued dependency references from a pnpm snapshot. */
function readStringMap(value: unknown): readonly [string, string][] {
  if (!isRecord(value)) return [];
  return Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
}

/*** Preserve unresolved graph edges rather than picking an arbitrary peer instance. */
function optionalId(packageId: string | undefined): object {
  return packageId === undefined ? {} : { packageId };
}

/*** List declared dependency names owned by a workspace/package manifest. */
function declaredNames(manifest: ApmManagerInspectionInput['root']['manifests'][number]): readonly string[] {
  return [...new Set([
    ...Object.keys(manifest.dependencies),
    ...Object.keys(manifest.devDependencies),
    ...Object.keys(manifest.optionalDependencies),
    ...Object.keys(manifest.peerDependencies),
  ])];
}

/*** Serialize a relative pnpm importer path with POSIX separators. */
function portableRelative(root: string, target: string): string {
  const relative = path.relative(root, target).split(path.sep).join('/');
  return relative === '' ? '.' : relative;
}

/*** Return explicit missing pnpm lock evidence. */
function missingPnpmLock(rootId: string): ApmManagerInspectionResult {
  return incompletePnpmResult(rootId, 'status.lockfile.missing', 'Selected pnpm root has no pnpm-lock.yaml.', 'missing');
}

/*** Reject pnpm lock formats other than the explicitly tested v9 schema. */
function unsupportedPnpmLock(rootId: string, lockPath: string, parsed: unknown): ApmManagerInspectionResult {
  const version = isRecord(parsed) && (typeof parsed.lockfileVersion === 'string' || typeof parsed.lockfileVersion === 'number')
    ? String(parsed.lockfileVersion)
    : undefined;
  return {
    ...incompletePnpmResult(rootId, 'status.lockfile.pnpm.unsupported-version', 'APM status supports pnpm lockfile version 9.0 only.', 'unsupported'),
    lockfile: {
      state: 'unsupported',
      path: lockPath,
      format: 'pnpm-lock',
      ...(version === undefined ? {} : { version }),
      evidence: [lockPath],
    },
  };
}

/*** Build the common incomplete pnpm result without inventing lock graph state. */
function incompletePnpmResult(
  rootId: string,
  code: string,
  reason: string,
  state: 'missing' | 'unsupported',
): ApmManagerInspectionResult {
  return {
    linker: 'virtual-store',
    lockfile: { state, evidence: ['pnpm-lock.yaml'] },
    lockedPackages: [],
    installedPackages: [],
    directResolutions: new Map(),
    complete: false,
    diagnostics: [
      {
        code,
        severity: 'error',
        scope: { kind: 'install-root', id: rootId },
        evidence: ['pnpm-lock.yaml'],
        reason,
        nextAction: 'Use pnpm lockfile v9 or treat this root as inspection-only.',
      },
    ],
  };
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { toPortablePath } from '@ankhorage/utility/node/path';
import { isRecord } from '@ankhorage/utility/object';
import { parseAllDocuments } from 'yaml';

import type { ApmLockedPackageEvidence } from '../../../../types/status.js';
import type {
  ApmManagerInspectionInput,
  ApmManagerLockEvidence,
} from '../../../../types/status-inventory.js';
import { declarationResolutionKey } from '../../utils/declarationResolutionKey.js';

/*** Read pnpm v9 lock graph evidence, including multi-document environment locks. */
export async function readPnpmLockEvidenceAsync(
  input: ApmManagerInspectionInput,
): Promise<ApmManagerLockEvidence> {
  const candidate = input.root.lockfileCandidates.find((item) => item.manager === 'pnpm');
  if (candidate === undefined) return incompletePnpmLock(input.root.id, 'missing');
  const text = await readFile(path.join(input.root.rootPath, 'pnpm-lock.yaml'), 'utf8');
  const parsed = selectPnpmDocument(text);
  if (parsed === undefined) return unsupportedPnpmLock(input.root.id, candidate.path, text);

  const packages = isRecord(parsed.packages) ? parsed.packages : {};
  const snapshots = isRecord(parsed.snapshots) ? parsed.snapshots : {};
  const registryPackages = Object.entries(packages).flatMap(([key, value]) => {
    const identity = parsePnpmPackageKey(key);
    if (identity === undefined || !isRecord(value)) return [];
    const snapshot = isRecord(snapshots[key]) ? snapshots[key] : {};
    return [toLockedPnpmPackage(key, identity, snapshot, packages)];
  });
  const workspacePackages = readWorkspacePackages(parsed.importers, input);
  const lockedPackages = [...registryPackages, ...workspacePackages];
  return {
    lockfile: {
      state: 'supported',
      path: candidate.path,
      format: 'pnpm-lock',
      version: '9.0',
      evidence: [candidate.path],
    },
    lockedPackages,
    directResolutions: readPnpmDirectResolutions(parsed.importers, input, lockedPackages),
    complete: true,
    diagnostics: [],
  };
}

interface PnpmDocument {
  readonly lockfileVersion: unknown;
  readonly importers: Record<string, unknown>;
  readonly packages?: unknown;
  readonly snapshots?: unknown;
}

interface PnpmIdentity {
  readonly name: string;
  readonly version: string;
  readonly peerContext?: string;
}

/*** Select the v9 document containing importer state instead of assuming the first YAML document. */
function selectPnpmDocument(text: string): PnpmDocument | undefined {
  return parseAllDocuments(text)
    .filter((document) => document.errors.length === 0)
    .map((document) => document.toJS() as unknown)
    .find(isSupportedPnpmDocument);
}

/*** Narrow one YAML document to the v9 lock schema required by dependency inventory. */
function isSupportedPnpmDocument(value: unknown): value is PnpmDocument {
  return isRecord(value) && String(value.lockfileVersion) === '9.0' && isRecord(value.importers);
}

/*** Parse pnpm's package key while retaining peer-context suffixes in the native instance ID. */
function parsePnpmPackageKey(key: string): PnpmIdentity | undefined {
  const normalized = key.startsWith('/') ? key.slice(1) : key;
  const match = /^(@[^/]+\/[^@]+|[^@]+)@(.+)$/u.exec(normalized);
  if (match === null) return undefined;
  const [, name, rawVersion] = match;
  if (name === undefined || rawVersion === undefined) return undefined;
  const peerIndex = rawVersion.indexOf('(');
  return {
    name,
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

/*** Materialize pnpm workspace links as package instances instead of independent install roots. */
function readWorkspacePackages(
  importers: Record<string, unknown>,
  input: ApmManagerInspectionInput,
): readonly ApmLockedPackageEvidence[] {
  return Object.entries(importers).flatMap(([importerPath, importerValue]) => {
    if (!isRecord(importerValue)) return [];
    return readImporterDependencies(importerValue).flatMap(([name, value]) => {
      const reference = readPnpmImporterVersion(value);
      if (reference === undefined || !/^(?:link:|workspace:)/u.test(reference)) return [];
      const target = reference.replace(/^(?:link:|workspace:)/u, '');
      const id = `pnpm:workspace:${importerPath}:${name}:${target}`;
      return [
        {
          id,
          name,
          source: 'workspace' as const,
          optional: false,
          location: target,
          dependencies: [],
        },
      ];
    });
  });
}

/*** Map package declarations to pnpm importer resolutions without collapsing duplicate instances. */
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
    const entries = new Map(readImporterDependencies(importer));
    for (const name of declaredNames(manifest)) {
      const reference = readPnpmImporterVersion(entries.get(name));
      const resolved =
        reference === undefined
          ? undefined
          : resolveDirectPnpmPackage(importerPath, name, reference, lockedPackages);
      if (resolved !== undefined)
        result.set(declarationResolutionKey(manifest.manifestPath, name), resolved);
    }
  }
  return result;
}

/*** Resolve one pnpm importer reference against registry or workspace lock identities. */
function resolveDirectPnpmPackage(
  importerPath: string,
  name: string,
  reference: string,
  packages: readonly ApmLockedPackageEvidence[],
): string | undefined {
  if (/^(?:link:|workspace:)/u.test(reference)) {
    return packages.find(
      (pkg) =>
        pkg.source === 'workspace' &&
        pkg.name === name &&
        pkg.id.includes(`${importerPath}:${name}:`),
    )?.id;
  }
  return packages.find(
    (pkg) =>
      pkg.name === name && (pkg.version === reference || pkg.id.includes(`${name}@${reference}`)),
  )?.id;
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
  const [onlyKey] = keys;
  return keys.length === 1 && onlyKey !== undefined ? `pnpm:${onlyKey}` : undefined;
}

/*** Read all pnpm importer dependency groups while keeping the raw resolution object. */
function readImporterDependencies(importer: Record<string, unknown>): readonly [string, unknown][] {
  return ['dependencies', 'devDependencies', 'optionalDependencies'].flatMap((key) =>
    isRecord(importer[key]) ? Object.entries(importer[key]) : [],
  );
}

/*** Extract the resolved pnpm importer reference from scalar or object form. */
function readPnpmImporterVersion(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return isRecord(value) && typeof value.version === 'string' ? value.version : undefined;
}

/*** Read string-valued dependency references from a pnpm snapshot. */
function readStringMap(value: unknown): readonly [string, string][] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([name, entryValue]) =>
    typeof entryValue === 'string' ? [[name, entryValue] as [string, string]] : [],
  );
}

/*** Preserve unresolved graph edges instead of picking an arbitrary peer instance. */
function optionalId(packageId: string | undefined): object {
  return packageId === undefined ? {} : { packageId };
}

/*** List declared dependency names owned by a workspace/package manifest. */
function declaredNames(
  manifest: ApmManagerInspectionInput['root']['manifests'][number],
): readonly string[] {
  return [
    ...new Set([
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.devDependencies),
      ...Object.keys(manifest.optionalDependencies),
      ...Object.keys(manifest.peerDependencies),
    ]),
  ];
}

/*** Serialize a relative pnpm importer path with Utility's portable-path primitive. */
function portableRelative(root: string, target: string): string {
  const relative = toPortablePath(path.relative(root, target));
  return relative === '' ? '.' : relative;
}

/*** Return explicit missing pnpm lock evidence. */
function incompletePnpmLock(rootId: string, state: 'missing'): ApmManagerLockEvidence {
  return {
    lockfile: { state, evidence: ['pnpm-lock.yaml'] },
    lockedPackages: [],
    directResolutions: new Map(),
    complete: false,
    diagnostics: [
      {
        code: 'status.lockfile.missing',
        severity: 'error',
        scope: { kind: 'install-root', id: rootId },
        evidence: ['pnpm-lock.yaml'],
        reason: 'Selected pnpm root has no pnpm-lock.yaml.',
        nextAction: 'Generate pnpm lockfile v9 before relying on full status.',
      },
    ],
  };
}

/*** Reject pnpm documents that do not expose the supported v9 importer schema. */
function unsupportedPnpmLock(
  rootId: string,
  lockPath: string,
  text: string,
): ApmManagerLockEvidence {
  const versionMatch = /^lockfileVersion:\s*['"]?([^'"\s]+)['"]?/mu.exec(text);
  const version = versionMatch?.[1];
  return {
    lockfile: {
      state: 'unsupported',
      path: lockPath,
      format: 'pnpm-lock',
      ...(version === undefined ? {} : { version }),
      evidence: [lockPath],
    },
    lockedPackages: [],
    directResolutions: new Map(),
    complete: false,
    diagnostics: [
      {
        code: 'status.lockfile.pnpm.unsupported-version',
        severity: 'error',
        scope: { kind: 'install-root', id: rootId, path: lockPath },
        evidence: version === undefined ? [lockPath] : [`${lockPath}: lockfileVersion ${version}`],
        reason: 'APM status supports pnpm v9 lock documents containing importer state.',
        nextAction: 'Use pnpm lockfile v9 or keep this root inspection-only.',
      },
    ],
  };
}

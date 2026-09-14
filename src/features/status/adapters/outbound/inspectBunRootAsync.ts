import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { pathExists } from '@ankhorage/utility/node/fs';
import { isRecord } from '@ankhorage/utility/object';
import { satisfies, valid, validRange } from 'semver';
import { parse as parseJsonc, type ParseError } from 'jsonc-parser';

import type { ApmManagerInspectionInput, ApmManagerInspectionResult } from '../../../types/status-inventory.js';
import type { ApmInstalledPackageEvidence, ApmLockedPackageEvidence } from '../../../types/status.js';
import { declarationResolutionKey } from '../utils/declarationResolutionKey.js';
import { readInstalledPackageVersionAsync } from '../utils/readInstalledPackageVersionAsync.js';

/*** Inspect Bun text lock v2 and either isolated `.bun` store or hoisted node_modules evidence. */
export async function inspectBunRootAsync(input: ApmManagerInspectionInput): Promise<ApmManagerInspectionResult> {
  const textCandidate = input.root.lockfileCandidates.find(
    (item) => item.manager === 'bun' && item.fileName === 'bun.lock',
  );
  const binaryCandidate = input.root.lockfileCandidates.find(
    (item) => item.manager === 'bun' && item.fileName === 'bun.lockb',
  );
  if (textCandidate === undefined) {
    const reason = binaryCandidate === undefined
      ? 'Selected Bun root has no bun.lock.'
      : 'Binary bun.lockb is detected; APM never executes Bun to decode it.';
    return incompleteBun(input.root.id, reason, binaryCandidate?.path ?? 'bun.lock');
  }
  const errors: ParseError[] = [];
  const parsed = parseJsonc(await readFile(path.join(input.root.rootPath, 'bun.lock'), 'utf8'), errors, {
    allowTrailingComma: true,
  }) as unknown;
  if (errors.length > 0 || !isRecord(parsed) || parsed.lockfileVersion !== 2 || !isRecord(parsed.packages)) {
    return unsupportedBun(input.root.id, textCandidate.path, parsed, errors.length);
  }
  const lockedPackages = Object.entries(parsed.packages).flatMap(([key, value]) => {
    const pkg = readBunPackage(key, value, parsed.packages as Record<string, unknown>);
    return pkg === undefined ? [] : [pkg];
  });
  const directResolutions = readBunDirectResolutions(input, lockedPackages);
  const isolatedStore = path.join(input.root.rootPath, 'node_modules', '.bun');
  const isolated = await pathExists(isolatedStore);
  const installedPackages = isolated
    ? await inspectBunIsolatedAsync(input, lockedPackages, isolatedStore)
    : await inspectBunHoistedAsync(input, lockedPackages);
  const complete = installedPackages.every((item) => item.state !== 'unknown');
  return {
    linker: isolated ? 'isolated' : 'hoisted',
    lockfile: {
      state: 'supported',
      path: textCandidate.path,
      format: 'bun-text-lock',
      version: '2',
      evidence: [textCandidate.path, `configVersion ${String(parsed.configVersion ?? 'unknown')}`],
    },
    lockedPackages,
    installedPackages,
    directResolutions,
    complete,
    diagnostics: complete
      ? []
      : [
          {
            code: 'status.install.bun.instance-unknown',
            severity: 'warning',
            scope: { kind: 'install-root', id: input.root.id },
            evidence: [isolated ? 'node_modules/.bun' : 'node_modules'],
            reason: 'At least one Bun lock instance could not be mapped to installed package data.',
          },
        ],
  };
}

/*** Convert one Bun package tuple into a stable lock instance with dependency edges. */
function readBunPackage(
  key: string,
  value: unknown,
  packages: Record<string, unknown>,
): ApmLockedPackageEvidence | undefined {
  if (!Array.isArray(value) || typeof value[0] !== 'string') return undefined;
  const identity = parseBunLocator(value[0]);
  if (identity === undefined) return undefined;
  const metadata = isRecord(value[2]) ? value[2] : {};
  const dependencies = [
    ...readStringMap(metadata.dependencies),
    ...readStringMap(metadata.optionalDependencies),
  ].map(([name, requested]) => ({
    name,
    requested,
    ...optionalId(resolveBunPackageId(name, requested, packages)),
  }));
  return {
    id: `bun:${key}`,
    name: identity.name,
    ...(identity.version === undefined ? {} : { version: identity.version }),
    source: identity.source,
    optional: false,
    ...(identity.peerContext === undefined ? {} : { peerContext: identity.peerContext }),
    dependencies,
  };
}

interface BunIdentity {
  readonly name: string;
  readonly version?: string;
  readonly peerContext?: string;
  readonly source: ApmLockedPackageEvidence['source'];
}

/*** Parse Bun's package locator while retaining peer variant data when present. */
function parseBunLocator(locator: string): BunIdentity | undefined {
  const match = /^(@[^/]+\/[^@]+|[^@]+)@(.+)$/u.exec(locator);
  if (match === null) return undefined;
  const raw = match[2];
  const peerIndex = raw.indexOf('+');
  const versionOrSource = peerIndex < 0 ? raw : raw.slice(0, peerIndex);
  const source: ApmLockedPackageEvidence['source'] = versionOrSource.startsWith('workspace:')
    ? 'workspace'
    : versionOrSource.startsWith('file:')
      ? 'file'
      : versionOrSource.startsWith('git+') || versionOrSource.startsWith('github:')
        ? 'git'
        : 'registry';
  return {
    name: match[1],
    ...(source === 'registry' ? { version: versionOrSource } : {}),
    ...(peerIndex < 0 ? {} : { peerContext: raw.slice(peerIndex) }),
    source,
  };
}

/*** Resolve Bun dependency edges without collapsing duplicate version keys. */
function resolveBunPackageId(
  name: string,
  requested: string,
  packages: Record<string, unknown>,
): string | undefined {
  if (Object.hasOwn(packages, name)) return `bun:${name}`;
  const candidates = Object.entries(packages).flatMap(([key, value]) => {
    if (!Array.isArray(value) || typeof value[0] !== 'string') return [];
    const identity = parseBunLocator(value[0]);
    if (identity?.name !== name) return [];
    const range = stripBunProtocol(requested);
    if (
      identity.version !== undefined &&
      valid(identity.version) !== null &&
      validRange(range) !== null &&
      satisfies(identity.version, range)
    ) {
      return [`bun:${key}`];
    }
    return [];
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

/*** Map package declarations to Bun package tuple identities. */
function readBunDirectResolutions(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const manifest of input.root.manifests) {
    for (const [name, range] of declarationPairs(manifest)) {
      const exact = packages.find((pkg) => pkg.id === `bun:${name}`);
      const semantic = packages.filter(
        (pkg) =>
          pkg.name === name &&
          pkg.version !== undefined &&
          valid(pkg.version) !== null &&
          validRange(stripBunProtocol(range)) !== null &&
          satisfies(pkg.version, stripBunProtocol(range)),
      );
      const resolved = exact?.id ?? (semantic.length === 1 ? semantic[0]!.id : undefined);
      if (resolved !== undefined) {
        result.set(declarationResolutionKey(manifest.manifestPath, name), resolved);
      }
    }
  }
  return result;
}

/*** Confirm Bun isolated instances from the documented `.bun/name@version/node_modules/name` store. */
async function inspectBunIsolatedAsync(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
  storePath: string,
): Promise<readonly ApmInstalledPackageEvidence[]> {
  const entries = await readdir(storePath).catch(() => [] as string[]);
  return Promise.all(
    packages.map(async (pkg) => {
      if (pkg.source !== 'registry' || pkg.version === undefined) {
        return readDirectBunLinkAsync(input, pkg);
      }
      const prefix = `${bunStorePackageName(pkg.name)}@${pkg.version}`;
      const candidates = entries.filter((entry) => entry === prefix || entry.startsWith(`${prefix}+`));
      if (candidates.length !== 1) {
        return candidates.length === 0
          ? { packageId: pkg.id, state: 'absent', source: 'bun-store', reason: 'Bun isolated store entry is absent.' }
          : { packageId: pkg.id, state: 'unknown', source: 'bun-store', reason: 'Multiple Bun peer variants match this lock instance.' };
      }
      const location = `node_modules/.bun/${candidates[0]}/node_modules/${pkg.name}`;
      return readInstalledPackageVersionAsync({
        packageId: pkg.id,
        packagePath: path.join(input.root.rootPath, ...location.split('/')),
        source: 'bun-store',
        serializedLocation: location,
      });
    }),
  );
}

/*** Inspect hoisted Bun packages through Node-compatible physical package locations when unambiguous. */
async function inspectBunHoistedAsync(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): Promise<readonly ApmInstalledPackageEvidence[]> {
  const counts = new Map<string, number>();
  for (const pkg of packages) counts.set(pkg.name, (counts.get(pkg.name) ?? 0) + 1);
  return Promise.all(
    packages.map((pkg) =>
      counts.get(pkg.name) === 1
        ? readDirectBunLinkAsync(input, pkg)
        : Promise.resolve({
            packageId: pkg.id,
            state: 'unknown' as const,
            source: 'node-modules' as const,
            reason: 'Hoisted node_modules cannot identify which duplicate Bun lock instance occupies this name.',
          }),
    ),
  );
}

/*** Read the top-level Bun symlink/package for direct or uniquely hoisted evidence. */
function readDirectBunLinkAsync(
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

/*** Encode scoped package names using Bun's documented plus-sign store naming. */
function bunStorePackageName(name: string): string {
  return name.startsWith('@') ? name.replace('/', '+') : name;
}

/*** Strip Bun's npm protocol alias before semantic range checks. */
function stripBunProtocol(range: string): string {
  return range.startsWith('npm:') ? range.slice('npm:'.length) : range;
}

/*** Read string-valued dependency metadata from a Bun lock tuple. */
function readStringMap(value: unknown): readonly [string, string][] {
  if (!isRecord(value)) return [];
  return Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
}

/*** List package declarations for direct Bun lock resolution. */
function declarationPairs(
  manifest: ApmManagerInspectionInput['root']['manifests'][number],
): readonly [string, string][] {
  return [
    ...Object.entries(manifest.dependencies),
    ...Object.entries(manifest.devDependencies),
    ...Object.entries(manifest.optionalDependencies),
    ...Object.entries(manifest.peerDependencies),
  ];
}

/*** Avoid undefined packageId properties under exact optional property semantics. */
function optionalId(packageId: string | undefined): object {
  return packageId === undefined ? {} : { packageId };
}

/*** Return incomplete binary/missing Bun lock evidence without invoking Bun. */
function incompleteBun(rootId: string, reason: string, lockPath: string): ApmManagerInspectionResult {
  return {
    linker: 'unknown',
    lockfile: { state: 'unsupported', path: lockPath, format: 'bun-lock', evidence: [lockPath] },
    lockedPackages: [],
    installedPackages: [],
    directResolutions: new Map(),
    complete: false,
    diagnostics: [
      {
        code: 'status.lockfile.bun.unsupported',
        severity: 'error',
        scope: { kind: 'install-root', id: rootId, path: lockPath },
        evidence: [lockPath],
        reason,
        nextAction: 'Generate the supported Bun text lock format before relying on full status.',
      },
    ],
  };
}

/*** Reject malformed or unknown Bun text lock versions as inspection-only evidence. */
function unsupportedBun(
  rootId: string,
  lockPath: string,
  parsed: unknown,
  parseErrorCount: number,
): ApmManagerInspectionResult {
  const version = isRecord(parsed) && typeof parsed.lockfileVersion === 'number'
    ? String(parsed.lockfileVersion)
    : undefined;
  return {
    linker: 'unknown',
    lockfile: {
      state: 'unsupported',
      path: lockPath,
      format: 'bun-text-lock',
      ...(version === undefined ? {} : { version }),
      evidence: [lockPath, `parse errors: ${parseErrorCount}`],
    },
    lockedPackages: [],
    installedPackages: [],
    directResolutions: new Map(),
    complete: false,
    diagnostics: [
      {
        code: 'status.lockfile.bun.unsupported-version',
        severity: 'error',
        scope: { kind: 'install-root', id: rootId, path: lockPath },
        evidence: version === undefined ? [lockPath] : [`${lockPath}: lockfileVersion ${version}`],
        reason: 'APM status supports valid Bun text lock version 2 only.',
        nextAction: 'Use Bun lockfile v2 or keep this root inspection-only.',
      },
    ],
  };
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { isRecord } from '@ankhorage/utility/object';
import { parse as parseJsonc, type ParseError } from 'jsonc-parser';
import { valid } from 'semver';

import type { ApmLockedPackageEvidence } from '../../../../types/status.js';
import type {
  ApmManagerInspectionInput,
  ApmManagerLockEvidence,
} from '../../../../types/status-inventory.js';
import { parseBunPackagePath } from '../../domain/parseBunPackagePath.js';
import { declarationResolutionKey } from '../../utils/declarationResolutionKey.js';

/*** Read Bun text-lock v2 dependency graph evidence without invoking Bun. */
export async function readBunLockEvidenceAsync(
  input: ApmManagerInspectionInput,
): Promise<ApmManagerLockEvidence> {
  const textCandidate = input.root.lockfileCandidates.find(
    (item) => item.manager === 'bun' && item.fileName === 'bun.lock',
  );
  const binaryCandidate = input.root.lockfileCandidates.find(
    (item) => item.manager === 'bun' && item.fileName === 'bun.lockb',
  );
  if (textCandidate === undefined) {
    return unsupportedBun(
      input.root.id,
      binaryCandidate?.path ?? 'bun.lock',
      binaryCandidate === undefined
        ? 'Selected Bun root has no bun.lock.'
        : 'Binary bun.lockb is detected; APM never executes Bun to decode it.',
    );
  }

  const parsed = await parseBunTextLockAsync(input.root.rootPath);
  if (parsed.lock === undefined) {
    return unsupportedBun(
      input.root.id,
      textCandidate.path,
      'APM status supports valid Bun text lock version 2 only.',
      parsed.raw,
      parsed.parseErrorCount,
    );
  }
  return toBunLockEvidence(input, textCandidate.path, parsed.lock);
}

interface BunLock {
  readonly lockfileVersion: 2;
  readonly configVersion?: unknown;
  readonly packages: Record<string, unknown>;
}

interface ParsedBunTextLock {
  readonly lock?: BunLock;
  readonly raw: unknown;
  readonly parseErrorCount: number;
}

interface BunIdentity {
  readonly name: string;
  readonly version?: string;
  readonly peerContext?: string;
  readonly source: ApmLockedPackageEvidence['source'];
}

/*** Parse Bun text-lock JSONC into a supported v2 shape without executing package code. */
async function parseBunTextLockAsync(rootPath: string): Promise<ParsedBunTextLock> {
  const errors: ParseError[] = [];
  const raw = parseJsonc(await readFile(path.join(rootPath, 'bun.lock'), 'utf8'), errors, {
    allowTrailingComma: true,
  }) as unknown;
  return {
    ...(errors.length === 0 && isSupportedBunLock(raw) ? { lock: raw } : {}),
    raw,
    parseErrorCount: errors.length,
  };
}

/*** Convert a validated Bun lock into immutable APM graph evidence. */
function toBunLockEvidence(
  input: ApmManagerInspectionInput,
  lockPath: string,
  lock: BunLock,
): ApmManagerLockEvidence {
  const lockedPackages = Object.entries(lock.packages).flatMap(([key, value]) => {
    const pkg = readBunPackage(key, value, lock.packages);
    return pkg === undefined ? [] : [pkg];
  });
  return {
    lockfile: {
      state: 'supported',
      path: lockPath,
      format: 'bun-text-lock',
      version: '2',
      evidence: [lockPath, `configVersion ${serializeConfigVersion(lock.configVersion)}`],
    },
    lockedPackages,
    directResolutions: readBunDirectResolutions(input, lockedPackages),
    complete: lockedPackages.length === Object.keys(lock.packages).length,
    diagnostics: Object.keys(lock.packages)
      .filter((key) => !lockedPackages.some((pkg) => pkg.id === `bun:${key}`))
      .map((key) => ({
        code: 'status.lockfile.bun.invalid-instance',
        severity: 'error' as const,
        scope: { kind: 'install-root' as const, id: input.root.id, path: lockPath },
        evidence: [key],
        reason: 'Bun lock instance has an unsupported locator or unsafe placement key.',
      })),
  };
}

/*** Narrow parsed JSONC to the text-lock v2 shape APM understands. */
function isSupportedBunLock(value: unknown): value is BunLock {
  return isRecord(value) && value.lockfileVersion === 2 && isRecord(value.packages);
}

/*** Serialize the Bun config version without falling back to Object stringification. */
function serializeConfigVersion(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : 'unknown';
}

/*** Convert one Bun package tuple into a stable lock instance with dependency edges. */
function readBunPackage(
  key: string,
  value: unknown,
  packages: Record<string, unknown>,
): ApmLockedPackageEvidence | undefined {
  if (!Array.isArray(value) || typeof value[0] !== 'string') return undefined;
  const identity = parseBunLocator(value[0]);
  const names = parseBunPackagePath(key);
  if (identity === undefined || names === undefined) return undefined;
  const metadata = isRecord(value[1]) ? value[1] : isRecord(value[2]) ? value[2] : {};
  const dependencies = [
    ...readStringMap(metadata.dependencies),
    ...readStringMap(metadata.optionalDependencies),
  ].map(([name, requested]) => ({
    name,
    requested,
    ...optionalId(resolveBunPackageId(names, name, packages)),
  }));
  return {
    id: `bun:${key}`,
    location: names.map((name) => `node_modules/${name}`).join('/'),
    name: identity.name,
    ...(identity.version === undefined ? {} : { version: identity.version }),
    source: identity.source,
    optional: isBunPackageOptionalOnCurrentHost(metadata),
    ...(identity.peerContext === undefined ? {} : { peerContext: identity.peerContext }),
    dependencies,
  };
}

/*** Parse Bun's package locator while retaining peer-variant data when present. */
function parseBunLocator(locator: string): BunIdentity | undefined {
  const match = /^(@[^/]+\/[^@]+|[^@]+)@(.+)$/u.exec(locator);
  if (match === null) return undefined;
  const [, name, raw] = match;
  if (name === undefined || raw === undefined) return undefined;
  const source = bunSource(raw);
  const peerIndex = source === 'registry' ? raw.indexOf('+') : -1;
  const versionOrSource = peerIndex < 0 ? raw : raw.slice(0, peerIndex);
  if (source === 'registry' && valid(versionOrSource) === null) return undefined;
  return {
    name,
    ...(source === 'registry' ? { version: versionOrSource } : {}),
    ...(peerIndex < 0 ? {} : { peerContext: raw.slice(peerIndex) }),
    source,
  };
}

/*** Classify Bun locator sources before semantic-version handling. */
function bunSource(value: string): ApmLockedPackageEvidence['source'] {
  if (value.startsWith('workspace:')) return 'workspace';
  if (
    value.startsWith('file:') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  )
    return 'file';
  if (value.startsWith('git+') || value.startsWith('github:')) return 'git';
  return 'registry';
}

/*** Resolve direct declarations from their root/workspace placement, never by a global version guess. */
function readBunDirectResolutions(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): ReadonlyMap<string, string> {
  const placements = Object.fromEntries(packages.map((pkg) => [pkg.id.slice(4), pkg]));
  return new Map(
    input.root.manifests.flatMap((manifest) => {
      const names =
        manifest.packageRoot === input.root.rootPath
          ? []
          : manifest.name === undefined
            ? undefined
            : parseBunPackagePath(manifest.name);
      if (names === undefined) return [];
      return declarationPairs(manifest).flatMap(([name]) => {
        const resolved = resolveBunPackageId(names, name, placements);
        return resolved === undefined
          ? []
          : [[declarationResolutionKey(manifest.manifestPath, name), resolved] as const];
      });
    }),
  );
}

/*** Follow the nearest Bun placement, preserving nested/scoped instances instead of selecting by name. */
function resolveBunPackageId(
  from: readonly string[],
  name: string,
  packages: Readonly<Record<string, unknown>>,
): string | undefined {
  if (parseBunPackagePath(name)?.length !== 1) return undefined;
  const candidates = Array.from({ length: from.length + 1 }, (_, index) =>
    [...from.slice(0, from.length - index), name].join('/'),
  );
  const selected = candidates.find((candidate) => Object.hasOwn(packages, candidate));
  return selected === undefined ? undefined : `bun:${selected}`;
}

/*** Read string-valued dependency metadata from a Bun lock tuple. */
function readStringMap(value: unknown): readonly [string, string][] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([name, entryValue]) =>
    typeof entryValue === 'string' ? [[name, entryValue] as [string, string]] : [],
  );
}

/*** Mark Bun packages optional only when explicit metadata allows absence on the current host. */
function isBunPackageOptionalOnCurrentHost(metadata: Readonly<Record<string, unknown>>): boolean {
  return (
    metadata.optional === true ||
    constraintExcludesCurrentHost(metadata.os, process.platform) ||
    constraintExcludesCurrentHost(metadata.cpu, process.arch)
  );
}

/*** Evaluate npm-style positive/negative Bun platform constraints without executing package code. */
function constraintExcludesCurrentHost(value: unknown, current: string): boolean {
  const constraints =
    typeof value === 'string'
      ? [value]
      : Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? value
        : [];
  if (constraints.length === 0) return false;
  const excluded = constraints
    .filter((item) => item.startsWith('!'))
    .map((item) => item.slice(1));
  if (excluded.includes(current) || excluded.includes('*')) return true;
  const allowed = constraints.filter((item) => !item.startsWith('!') && item !== '*');
  return allowed.length > 0 && !allowed.includes(current);
}

/*** List direct package declarations used for Bun lock resolution. */
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

/*** Avoid adding undefined packageId properties under exact optional property semantics. */
function optionalId(packageId: string | undefined): object {
  return packageId === undefined ? {} : { packageId };
}

/*** Return missing/binary/malformed Bun lock evidence without invoking Bun. */
function unsupportedBun(
  rootId: string,
  lockPath: string,
  reason: string,
  parsed?: unknown,
  parseErrorCount = 0,
): ApmManagerLockEvidence {
  const version =
    isRecord(parsed) && typeof parsed.lockfileVersion === 'number'
      ? String(parsed.lockfileVersion)
      : undefined;
  return {
    lockfile: {
      state: 'unsupported',
      path: lockPath,
      format: 'bun-lock',
      ...(version === undefined ? {} : { version }),
      evidence: [lockPath, ...(parseErrorCount === 0 ? [] : [`parse errors: ${parseErrorCount}`])],
    },
    lockedPackages: [],
    directResolutions: new Map(),
    complete: false,
    diagnostics: [
      {
        code: 'status.lockfile.bun.unsupported',
        severity: 'error',
        scope: { kind: 'install-root', id: rootId, path: lockPath },
        evidence: [lockPath],
        reason,
        nextAction: 'Generate Bun text lock v2 before relying on full status.',
      },
    ],
  };
}

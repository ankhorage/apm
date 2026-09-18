import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isRecord } from '@ankhorage/utility/object';
import { parse as parseJsonc, type ParseError } from 'jsonc-parser';
import { valid } from 'semver';

import type { ApmLockedPackageEvidence } from '../../../../types/status.js';
import type {
  ApmManagerInspectionInput,
  ApmManagerLockEvidence,
} from '../../../../types/status-inventory.js';
import { parseBunPackagePath } from '../../domain/parseBunPackagePath.js';
import { isBunPackageOptionalOnCurrentHost } from './isBunPackageOptionalOnCurrentHost.js';
import { readBunDirectResolutions } from './readBunDirectResolutions.js';
import { resolveBunRequiredPackageIds } from './resolveBunRequiredPackageIds.js';

/*** Read Bun text-lock v1/v2 dependency graph evidence without invoking Bun. */
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
      'APM status supports valid Bun text lock versions 1 and 2 only.',
      parsed.raw,
      parsed.parseErrorCount,
    );
  }
  return toBunLockEvidence(input, textCandidate.path, parsed.lock);
}

interface BunLock {
  readonly lockfileVersion: 1 | 2;
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

interface ParsedBunPackage {
  readonly evidence: ApmLockedPackageEvidence;
  readonly requiredDependencyIds: readonly string[];
}

/*** Parse Bun text-lock JSONC into a supported v1/v2 shape without executing Bun. */
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
  const parsedPackages = Object.entries(lock.packages).flatMap(([key, value]) => {
    const pkg = readBunPackage(key, value, lock.packages);
    return pkg === undefined ? [] : [pkg];
  });
  const basePackages = parsedPackages.map(({ evidence }) => evidence);
  const directResolutions = readBunDirectResolutions(input, basePackages);
  const requiredPackageIds = resolveBunRequiredPackageIds(input, parsedPackages, directResolutions);
  const lockedPackages = parsedPackages.map(({ evidence }) => ({
    ...evidence,
    optional: evidence.optional || !requiredPackageIds.has(evidence.id),
  }));
  return {
    lockfile: {
      state: 'supported',
      path: lockPath,
      format: 'bun-text-lock',
      version: String(lock.lockfileVersion),
      evidence: [lockPath, `configVersion ${serializeConfigVersion(lock.configVersion)}`],
    },
    lockedPackages,
    directResolutions,
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

/*** Narrow parsed JSONC to the text-lock versions APM understands. */
function isSupportedBunLock(value: unknown): value is BunLock {
  return (\n    isRecord(value) &&\n    (value.lockfileVersion === 1 || value.lockfileVersion === 2) &&\n    isRecord(value.packages)\n  );
}

/*** Serialize the Bun config version without falling back to Object stringification. */
function serializeConfigVersion(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : 'unknown';
}

/*** Convert one Bun package tuple into stable lock evidence while retaining mandatory dependency edges. */
function readBunPackage(
  key: string,
  value: unknown,
  packages: Record<string, unknown>,
): ParsedBunPackage | undefined {
  if (!Array.isArray(value) || typeof value[0] !== 'string') return undefined;
  const identity = parseBunLocator(value[0]);
  const names = parseBunPackagePath(key);
  if (identity === undefined || names === undefined) return undefined;
  const metadata = isRecord(value[1]) ? value[1] : isRecord(value[2]) ? value[2] : {};
  const requiredDependencies = dependencyEdges(
    names,
    readStringMap(metadata.dependencies),
    packages,
  );
  const optionalDependencies = dependencyEdges(
    names,
    readStringMap(metadata.optionalDependencies),
    packages,
  );
  return {
    evidence: {
      id: `bun:${key}`,
      location: names.map((name) => `node_modules/${name}`).join('/'),
      name: identity.name,
      ...(identity.version === undefined ? {} : { version: identity.version }),
      source: identity.source,
      optional: isBunPackageOptionalOnCurrentHost(metadata),
      ...(identity.peerContext === undefined ? {} : { peerContext: identity.peerContext }),
      dependencies: [...requiredDependencies, ...optionalDependencies],
    },
    requiredDependencyIds: requiredDependencies.flatMap(({ packageId }) =>
      packageId === undefined ? [] : [packageId],
    ),
  };
}

/*** Build resolved Bun dependency edges while preserving nearest package placement. */
function dependencyEdges(
  from: readonly string[],
  entries: readonly [string, string][],
  packages: Readonly<Record<string, unknown>>,
): ApmLockedPackageEvidence['dependencies'] {
  return entries.map(([name, requested]) => ({
    name,
    requested,
    ...optionalId(resolveBunPackageId(from, name, packages)),
  }));
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

/*** Read string-valued dependency metadata from a Bun lock tuple. */
function readStringMap(value: unknown): readonly [string, string][] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([name, entryValue]) =>
    typeof entryValue === 'string' ? [[name, entryValue] as [string, string]] : [],
  );
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
        nextAction: 'Generate Bun text lock v1 or v2 before relying on full status.',
      },
    ],
  };
}

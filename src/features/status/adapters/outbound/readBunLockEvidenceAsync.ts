import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isRecord } from '@ankhorage/utility/object';
import { parse as parseJsonc, type ParseError } from 'jsonc-parser';
import { satisfies, valid, validRange } from 'semver';

import type { ApmLockedPackageEvidence } from '../../../../types/status.js';
import type {
  ApmManagerInspectionInput,
  ApmManagerLockEvidence,
} from '../../../../types/status-inventory.js';
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
    complete: true,
    diagnostics: [],
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

/*** Parse Bun's package locator while retaining peer-variant data when present. */
function parseBunLocator(locator: string): BunIdentity | undefined {
  const match = /^(@[^/]+\/[^@]+|[^@]+)@(.+)$/u.exec(locator);
  if (match === null) return undefined;
  const [, name, raw] = match;
  if (name === undefined || raw === undefined) return undefined;
  const peerIndex = raw.indexOf('+');
  const versionOrSource = peerIndex < 0 ? raw : raw.slice(0, peerIndex);
  const source = bunSource(versionOrSource);
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
  if (value.startsWith('file:')) return 'file';
  if (value.startsWith('git+') || value.startsWith('github:')) return 'git';
  return 'registry';
}

/*** Resolve direct package.json declarations to unique Bun lock instances. */
function readBunDirectResolutions(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const manifest of input.root.manifests) {
    for (const [name, range] of declarationPairs(manifest)) {
      const exact = packages.find((pkg) => pkg.id === `bun:${name}`);
      const semantic = packages.filter((pkg) => matchesBunRange(pkg, name, range));
      const [onlySemantic] = semantic;
      const resolved = exact?.id ?? (semantic.length === 1 ? onlySemantic?.id : undefined);
      if (resolved !== undefined)
        result.set(declarationResolutionKey(manifest.manifestPath, name), resolved);
    }
  }
  return result;
}

/*** Resolve one transitive Bun dependency to a unique semantic lock instance. */
function resolveBunPackageId(
  name: string,
  requested: string,
  packages: Record<string, unknown>,
): string | undefined {
  if (Object.hasOwn(packages, name)) return `bun:${name}`;
  const candidates = Object.entries(packages).flatMap(([key, value]) => {
    if (!Array.isArray(value) || typeof value[0] !== 'string') return [];
    const identity = parseBunLocator(value[0]);
    return identity !== undefined && matchesBunIdentity(identity, name, requested)
      ? [`bun:${key}`]
      : [];
  });
  const [onlyCandidate] = candidates;
  return candidates.length === 1 ? onlyCandidate : undefined;
}

/*** Test one lock package against a Bun/npm semantic declaration. */
function matchesBunRange(pkg: ApmLockedPackageEvidence, name: string, range: string): boolean {
  return pkg.name === name && pkg.version !== undefined && semanticMatch(pkg.version, range);
}

/*** Test one parsed locator identity against a semantic dependency request. */
function matchesBunIdentity(identity: BunIdentity, name: string, range: string): boolean {
  return (
    identity.name === name &&
    identity.version !== undefined &&
    semanticMatch(identity.version, range)
  );
}

/*** Evaluate Bun's npm protocol aliases through standard semantic-version rules. */
function semanticMatch(version: string, range: string): boolean {
  const normalized = range.startsWith('npm:') ? range.slice('npm:'.length) : range;
  return (
    valid(version) !== null && validRange(normalized) !== null && satisfies(version, normalized)
  );
}

/*** Read string-valued dependency metadata from a Bun lock tuple. */
function readStringMap(value: unknown): readonly [string, string][] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([name, entryValue]) =>
    typeof entryValue === 'string' ? [[name, entryValue] as [string, string]] : [],
  );
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

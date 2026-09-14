import { isRecord } from '@ankhorage/utility/object';
import { satisfies, valid, validRange } from 'semver';

import type { ApmManagerInspectionInput, ApmManagerLockEvidence } from '../../../../types/status-inventory.js';
import type { ApmLockedPackageEvidence } from '../../../../types/status.js';
import { declarationResolutionKey } from '../../utils/declarationResolutionKey.js';

/*** Convert one supported Yarn Berry v8 lock object into package graph evidence. */
export function parseYarnLockEvidence(input: {
  readonly managerInput: ApmManagerInspectionInput;
  readonly lockPath: string;
  readonly parsed: Record<string, unknown>;
}): ApmManagerLockEvidence {
  const entries = Object.entries(input.parsed).filter(
    ([key, value]) => key !== '__metadata' && isRecord(value),
  );
  const lockedPackages = entries.flatMap(([key, value]) => {
    if (!isRecord(value)) return [];
    const identity = readYarnIdentity(key, value);
    return identity === undefined ? [] : [toLockedYarnPackage(key, value, identity, entries)];
  });
  return {
    lockfile: {
      state: 'supported',
      path: input.lockPath,
      format: 'yarn-berry-lock',
      version: '8',
      evidence: [input.lockPath],
    },
    lockedPackages,
    directResolutions: readYarnDirectResolutions(input.managerInput, lockedPackages, entries),
    complete: true,
    diagnostics: [],
  };
}

interface YarnIdentity {
  readonly name: string;
  readonly version?: string;
  readonly source: ApmLockedPackageEvidence['source'];
}

/*** Read package identity from Yarn's resolution field without interpreting executable PnP data. */
function readYarnIdentity(key: string, value: Record<string, unknown>): YarnIdentity | undefined {
  const resolution = typeof value.resolution === 'string' ? value.resolution : undefined;
  const descriptor = resolution ?? key.split(',')[0]?.trim();
  if (descriptor === undefined) return undefined;
  const protocolIndex = findYarnProtocolIndex(descriptor);
  if (protocolIndex < 0) return undefined;
  const name = descriptor.slice(0, protocolIndex);
  const protocolValue = descriptor.slice(protocolIndex + 1);
  const source: ApmLockedPackageEvidence['source'] = protocolValue.startsWith('workspace:')
    ? 'workspace'
    : protocolValue.startsWith('file:')
      ? 'file'
      : protocolValue.startsWith('git+') || protocolValue.startsWith('github:')
        ? 'git'
        : 'registry';
  return {
    name,
    ...(typeof value.version === 'string' ? { version: value.version } : {}),
    source,
  };
}

/*** Locate the protocol separator after either an unscoped or scoped Yarn package name. */
function findYarnProtocolIndex(descriptor: string): number {
  if (!descriptor.startsWith('@')) return descriptor.indexOf('@');
  const slash = descriptor.indexOf('/');
  return slash < 0 ? -1 : descriptor.indexOf('@', slash);
}

/*** Build one Yarn lock instance while preserving the complete descriptor-set key as identity. */
function toLockedYarnPackage(
  key: string,
  value: Record<string, unknown>,
  identity: YarnIdentity,
  entries: readonly [string, unknown][],
): ApmLockedPackageEvidence {
  const dependencies = [
    ...readStringMap(value.dependencies),
    ...readStringMap(value.optionalDependencies),
  ].map(([name, requested]) => ({
    name,
    requested,
    ...optionalId(resolveYarnTarget(name, requested, entries)),
  }));
  return {
    id: `yarn:${key}`,
    name: identity.name,
    ...(identity.version === undefined ? {} : { version: identity.version }),
    source: identity.source,
    optional: false,
    dependencies,
  };
}

/*** Resolve direct Yarn descriptors against the same lock entries used for transitive edges. */
function readYarnDirectResolutions(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
  entries: readonly [string, unknown][],
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const manifest of input.root.manifests) {
    for (const [name, range] of declarationPairs(manifest)) {
      const exact = resolveYarnTarget(name, range, entries);
      const semantic = packages.filter((pkg) => matchesYarnRange(pkg, name, range));
      const [onlySemantic] = semantic;
      const packageId = exact ?? (semantic.length === 1 ? onlySemantic?.id : undefined);
      if (packageId !== undefined) result.set(declarationResolutionKey(manifest.manifestPath, name), packageId);
    }
  }
  return result;
}

/*** Test one resolved Yarn package against a direct semantic declaration. */
function matchesYarnRange(pkg: ApmLockedPackageEvidence, name: string, range: string): boolean {
  const normalized = stripYarnProtocol(range);
  return (
    pkg.name === name &&
    pkg.version !== undefined &&
    valid(pkg.version) !== null &&
    validRange(normalized) !== null &&
    satisfies(pkg.version, normalized)
  );
}

/*** Resolve a Yarn descriptor only when one lock entry is an unambiguous match. */
function resolveYarnTarget(
  name: string,
  requested: string,
  entries: readonly [string, unknown][],
): string | undefined {
  const candidates = entries.filter(([key]) =>
    key.split(',').some((descriptor) => {
      const trimmed = descriptor.trim();
      return trimmed === `${name}@${requested}` || trimmed === `${name}@npm:${requested}`;
    }),
  );
  const [onlyCandidate] = candidates;
  return candidates.length === 1 && onlyCandidate !== undefined
    ? `yarn:${onlyCandidate[0]}`
    : undefined;
}

/*** Strip Yarn's npm protocol before semantic-range evaluation. */
function stripYarnProtocol(range: string): string {
  return range.startsWith('npm:') ? range.slice('npm:'.length) : range;
}

/*** Read string-valued Yarn dependency maps. */
function readStringMap(value: unknown): readonly [string, string][] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([name, entryValue]) =>
    typeof entryValue === 'string' ? [[name, entryValue] as [string, string]] : [],
  );
}

/*** List all direct package declarations for a package manifest. */
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

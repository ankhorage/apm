import path from 'node:path';

import { valid } from 'semver';

import type { ApmLockedPackageEvidence } from '../../../../types/status.js';
import { parseBunPackagePath } from '../../domain/parseBunPackagePath.js';

/*** Parse one Bun lock instance identity or return a bounded, actionable rejection classification. */
export function parseBunPackageIdentity(key: string, value: unknown): BunPackageIdentityResult {
  const keyEvidence = boundedValue(key);
  if (!Array.isArray(value)) {
    return rejected(
      `Bun lock instance is not encoded as a package tuple. Instance: ${keyEvidence}.`,
      [keyEvidence, 'tuple:not-array'],
    );
  }
  const locator: unknown = value[0];
  if (typeof locator !== 'string') {
    return rejected(
      `Bun lock instance tuple does not start with a string locator. Instance: ${keyEvidence}.`,
      [keyEvidence, `locator-type:${typeof locator}`],
    );
  }
  const locatorResult = parseLocator(locator, keyEvidence);
  if (locatorResult.state === 'rejected') return locatorResult;
  const names = parseBunPackagePath(key);
  if (names === undefined) {
    return rejected(
      `Bun lock instance placement key is unsafe or unsupported. Instance: ${keyEvidence}.`,
      [keyEvidence, 'placement:unsupported', boundedLocatorEvidence(locator)],
    );
  }
  return { state: 'resolved', identity: locatorResult.identity, names };
}

interface BunIdentity {
  readonly name: string;
  readonly version?: string;
  readonly peerContext?: string;
  readonly source: ApmLockedPackageEvidence['source'];
}

type BunPackageIdentityResult =
  | {
      readonly state: 'resolved';
      readonly identity: BunIdentity;
      readonly names: readonly string[];
    }
  | BunPackageIdentityRejection;

interface BunPackageIdentityRejection {
  readonly state: 'rejected';
  readonly reason: string;
  readonly evidence: readonly string[];
}

/*** Parse the package locator while retaining peer-variant identity for registry packages. */
function parseLocator(locator: string, keyEvidence: string): LocatorResult {
  const match = /^(@[^/]+\/[^@]+|[^@]+)@(.+)$/u.exec(locator);
  if (match === null) {
    return rejected(
      `Bun lock instance locator format is unsupported. Instance: ${keyEvidence}.`,
      [keyEvidence, 'locator:unsupported', boundedLocatorEvidence(locator)],
    );
  }
  const name = match[1];
  const raw = match[2];
  if (name === undefined || raw === undefined) {
    return rejected(
      `Bun lock instance locator identity is incomplete. Instance: ${keyEvidence}.`,
      [keyEvidence, 'locator:incomplete'],
    );
  }
  const source = bunSource(raw);
  const peerIndex = source === 'registry' ? raw.indexOf('+') : -1;
  const versionOrSource = peerIndex < 0 ? raw : raw.slice(0, peerIndex);
  if (source === 'registry' && valid(versionOrSource) === null) {
    return rejected(
      `Bun registry locator contains a non-semver version. Instance: ${keyEvidence}.`,
      [
        keyEvidence,
        'registry-version:unsupported',
        `package:${name}`,
        boundedLocatorEvidence(locator),
      ],
    );
  }
  return {
    state: 'resolved',
    identity: {
      name,
      ...(source === 'registry' ? { version: versionOrSource } : {}),
      ...(peerIndex < 0 ? {} : { peerContext: raw.slice(peerIndex) }),
      source,
    },
  };
}

type LocatorResult =
  | { readonly state: 'resolved'; readonly identity: BunIdentity }
  | BunPackageIdentityRejection;

/*** Classify Bun locator sources before semantic-version handling. */
function bunSource(value: string): ApmLockedPackageEvidence['source'] {
  if (value.startsWith('workspace:')) return 'workspace';
  if (
    value.startsWith('file:') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
    return 'file';
  }
  if (value.startsWith('git+') || value.startsWith('github:')) return 'git';
  return 'registry';
}

/*** Create one stable rejected identity result. */
function rejected(reason: string, evidence: readonly string[]): BunPackageIdentityRejection {
  return { state: 'rejected', reason, evidence };
}

/*** Bound arbitrary lock evidence before including it in structured diagnostics. */
function boundedValue(value: string): string {
  const maximumLength = 160;
  return value.length <= maximumLength ? value : `${value.slice(0, maximumLength)}…`;
}

/*** Prefix bounded locator evidence so consumers can distinguish it from placement identity. */
function boundedLocatorEvidence(locator: string): string {
  return `locator:${boundedValue(locator)}`;
}

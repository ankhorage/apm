import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { pathExists } from '@ankhorage/utility/node/fs';
import { isRecord } from '@ankhorage/utility/object';
import { satisfies, valid, validRange } from 'semver';
import { parse as parseYaml } from 'yaml';

import type { ApmManagerInspectionInput, ApmManagerInspectionResult } from '../../../types/status-inventory.js';
import type { ApmInstalledPackageEvidence, ApmLockedPackageEvidence, ApmStatusDiagnostic } from '../../../types/status.js';
import { declarationResolutionKey } from '../utils/declarationResolutionKey.js';

/*** Inspect Yarn Berry lock v8 plus supported PnP or node-modules installation evidence. */
export async function inspectYarnRootAsync(input: ApmManagerInspectionInput): Promise<ApmManagerInspectionResult> {
  const candidate = input.root.lockfileCandidates.find((item) => item.manager === 'yarn');
  if (candidate === undefined) return incompleteYarn(input.root.id, 'status.lockfile.missing', 'Selected Yarn root has no yarn.lock.', 'missing');
  const parsed = parseYaml(await readFile(path.join(input.root.rootPath, 'yarn.lock'), 'utf8')) as unknown;
  const metadata = isRecord(parsed) && isRecord(parsed.__metadata) ? parsed.__metadata : undefined;
  const version = metadata?.version;
  if (!isRecord(parsed) || (version !== 8 && version !== '8')) {
    return incompleteYarn(
      input.root.id,
      'status.lockfile.yarn.unsupported-version',
      'APM status supports Yarn Berry lock metadata version 8; Yarn Classic is inspection-only.',
      'unsupported',
      candidate.path,
      version,
    );
  }
  const entries = Object.entries(parsed).filter(([key, value]) => key !== '__metadata' && isRecord(value));
  const lockedPackages = entries.flatMap(([key, value]) => {
    if (!isRecord(value)) return [];
    const identity = readYarnIdentity(key, value);
    return identity === undefined ? [] : [toLockedYarnPackage(key, value, identity, entries)];
  });
  const directResolutions = readYarnDirectResolutions(input, lockedPackages, entries);
  const linker = await readYarnLinkerAsync(input.root.rootPath);
  const installation = await inspectYarnInstallationAsync(input, linker, lockedPackages);
  return {
    linker,
    lockfile: {
      state: 'supported',
      path: candidate.path,
      format: 'yarn-berry-lock',
      version: '8',
      evidence: [candidate.path],
    },
    lockedPackages,
    installedPackages: installation.packages,
    directResolutions,
    complete: installation.complete,
    diagnostics: installation.diagnostics,
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
      const semanticFallback = packages.filter(
        (pkg) =>
          pkg.name === name &&
          pkg.version !== undefined &&
          valid(pkg.version) !== null &&
          validRange(stripYarnProtocol(range)) !== null &&
          satisfies(pkg.version, stripYarnProtocol(range)),
      );
      const packageId = exact ?? (semanticFallback.length === 1 ? semanticFallback[0]!.id : undefined);
      if (packageId !== undefined) {
        result.set(declarationResolutionKey(manifest.manifestPath, name), packageId);
      }
    }
  }
  return result;
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
  return candidates.length === 1 ? `yarn:${candidates[0]![0]}` : undefined;
}

/*** Read Yarn nodeLinker as data; modern Yarn defaults to PnP. */
async function readYarnLinkerAsync(rootPath: string): Promise<string> {
  const yarnrc = path.join(rootPath, '.yarnrc.yml');
  if (!(await pathExists(yarnrc))) return 'pnp';
  const parsed = parseYaml(await readFile(yarnrc, 'utf8')) as unknown;
  return isRecord(parsed) && typeof parsed.nodeLinker === 'string' ? parsed.nodeLinker : 'pnp';
}

/*** Inspect Yarn installation markers without ever importing or executing `.pnp.cjs`. */
async function inspectYarnInstallationAsync(
  input: ApmManagerInspectionInput,
  linker: string,
  packages: readonly ApmLockedPackageEvidence[],
): Promise<YarnInstallationResult> {
  if (linker === 'pnp') return inspectYarnPnpAsync(input, packages);
  if (linker === 'node-modules') return inspectYarnNodeModulesAsync(input, packages);
  return {
    complete: false,
    packages: packages.map((pkg) => unknownInstall(pkg.id, 'Unsupported Yarn linker mode.')),
    diagnostics: [
      {
        code: 'status.install.yarn.unsupported-linker',
        severity: 'error',
        scope: { kind: 'install-root', id: input.root.id },
        evidence: [`nodeLinker: ${linker}`],
        reason: `Yarn linker ${linker} is detected but not a complete APM inventory mode.`,
        nextAction: 'Use Yarn PnP or node-modules for complete status evidence.',
      },
    ],
  };
}

interface YarnInstallationResult {
  readonly complete: boolean;
  readonly packages: readonly ApmInstalledPackageEvidence[];
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

/*** Parse `.pnp.data.json` when available; otherwise keep inlined executable PnP evidence unknown. */
async function inspectYarnPnpAsync(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): Promise<YarnInstallationResult> {
  const dataPath = path.join(input.root.rootPath, '.pnp.data.json');
  const cjsPath = path.join(input.root.rootPath, '.pnp.cjs');
  if (await pathExists(dataPath)) {
    const parsed = JSON.parse(await readFile(dataPath, 'utf8')) as unknown;
    const locators = readPnpLocators(parsed);
    return {
      complete: true,
      packages: packages.map((pkg) => {
        const present = locators.some(
          (locator) =>
            locator.name === pkg.name &&
            (pkg.version === undefined || locator.reference.includes(pkg.version)),
        );
        return present
          ? {
              packageId: pkg.id,
              state: 'present',
              source: 'pnp-data',
              ...(pkg.version === undefined ? {} : { version: pkg.version }),
              location: '.pnp.data.json',
            }
          : {
              packageId: pkg.id,
              state: 'absent',
              source: 'pnp-data',
              reason: 'Package locator is absent from .pnp.data.json.',
            };
      }),
      diagnostics: [],
    };
  }
  if (await pathExists(cjsPath)) {
    return {
      complete: false,
      packages: packages.map((pkg) =>
        unknownInstall(pkg.id, 'Yarn PnP data is inlined in executable .pnp.cjs and APM does not execute it.'),
      ),
      diagnostics: [
        {
          code: 'status.install.yarn.pnp-inlined',
          severity: 'warning',
          scope: { kind: 'install-root', id: input.root.id },
          evidence: ['.pnp.cjs'],
          reason: 'Yarn PnP installation exists, but its dependency map is executable JavaScript.',
          nextAction: 'Set pnpEnableInlining: false to expose read-only .pnp.data.json evidence.',
        },
      ],
    };
  }
  return {
    complete: true,
    packages: packages.map((pkg) => ({
      packageId: pkg.id,
      state: 'absent',
      source: 'pnp-data',
      reason: 'No Yarn PnP installation marker exists.',
    })),
    diagnostics: [],
  };
}

interface PnpLocator {
  readonly name: string;
  readonly reference: string;
}

/*** Extract package ident/reference pairs from Yarn's documented non-executable PnP data table. */
function readPnpLocators(value: unknown): readonly PnpLocator[] {
  if (!isRecord(value) || !Array.isArray(value.packageRegistryData)) return [];
  return value.packageRegistryData.flatMap((identEntry) => {
    if (!Array.isArray(identEntry) || identEntry.length < 2 || typeof identEntry[0] !== 'string' || !Array.isArray(identEntry[1])) {
      return [];
    }
    return identEntry[1].flatMap((referenceEntry) =>
      Array.isArray(referenceEntry) && typeof referenceEntry[0] === 'string'
        ? [{ name: identEntry[0], reference: referenceEntry[0] }]
        : [],
    );
  });
}

/*** Read Yarn's node-modules state file as locator evidence rather than crawling package code. */
async function inspectYarnNodeModulesAsync(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): Promise<YarnInstallationResult> {
  const nodeModules = path.join(input.root.rootPath, 'node_modules');
  if (!(await pathExists(nodeModules))) {
    return {
      complete: true,
      packages: packages.map((pkg) => ({
        packageId: pkg.id,
        state: 'absent',
        source: 'yarn-state',
        reason: 'node_modules is absent.',
      })),
      diagnostics: [],
    };
  }
  const statePath = path.join(nodeModules, '.yarn-state.yml');
  if (!(await pathExists(statePath))) {
    return {
      complete: false,
      packages: packages.map((pkg) => unknownInstall(pkg.id, 'node_modules/.yarn-state.yml is absent.')),
      diagnostics: [
        {
          code: 'status.install.yarn.state-missing',
          severity: 'warning',
          scope: { kind: 'install-root', id: input.root.id },
          evidence: ['node_modules/.yarn-state.yml'],
          reason: 'node_modules exists without Yarn node-modules installation-state evidence.',
        },
      ],
    };
  }
  const state = parseYaml(await readFile(statePath, 'utf8')) as unknown;
  const locatorKeys = isRecord(state) ? Object.keys(state).filter((key) => key !== '__metadata') : [];
  return {
    complete: true,
    packages: packages.map((pkg) => {
      const present = locatorKeys.some(
        (key) => key.includes(`${pkg.name}@`) && (pkg.version === undefined || key.includes(pkg.version)),
      );
      return present
        ? {
            packageId: pkg.id,
            state: 'present',
            source: 'yarn-state',
            ...(pkg.version === undefined ? {} : { version: pkg.version }),
            location: 'node_modules/.yarn-state.yml',
          }
        : {
            packageId: pkg.id,
            state: 'absent',
            source: 'yarn-state',
            reason: 'Package locator is absent from .yarn-state.yml.',
          };
    }),
    diagnostics: [],
  };
}

/*** Build explicit unknown Yarn installation evidence with no false absence claim. */
function unknownInstall(packageId: string, reason: string): ApmInstalledPackageEvidence {
  return { packageId, state: 'unknown', source: 'unknown', reason };
}

/*** Strip Yarn's npm protocol before semantic-range evaluation. */
function stripYarnProtocol(range: string): string {
  return range.startsWith('npm:') ? range.slice('npm:'.length) : range;
}

/*** Read string-valued Yarn dependency maps. */
function readStringMap(value: unknown): readonly [string, string][] {
  if (!isRecord(value)) return [];
  return Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
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

/*** Return explicit missing/unsupported Yarn lock evidence with the observed format version. */
function incompleteYarn(
  rootId: string,
  code: string,
  reason: string,
  state: 'missing' | 'unsupported',
  lockPath = 'yarn.lock',
  version?: unknown,
): ApmManagerInspectionResult {
  const serializedVersion = typeof version === 'string' || typeof version === 'number' ? String(version) : undefined;
  return {
    linker: 'unknown',
    lockfile: {
      state,
      path: lockPath,
      format: 'yarn-lock',
      ...(serializedVersion === undefined ? {} : { version: serializedVersion }),
      evidence: [lockPath],
    },
    lockedPackages: [],
    installedPackages: [],
    directResolutions: new Map(),
    complete: false,
    diagnostics: [
      {
        code,
        severity: 'error',
        scope: { kind: 'install-root', id: rootId, path: lockPath },
        evidence: serializedVersion === undefined ? [lockPath] : [`${lockPath}: metadata version ${serializedVersion}`],
        reason,
        nextAction: 'Use a supported Yarn Berry v8 lock or keep status inspection-only.',
      },
    ],
  };
}

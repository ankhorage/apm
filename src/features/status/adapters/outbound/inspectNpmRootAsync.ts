import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { toPortablePath } from '@ankhorage/utility/node/path';
import { isRecord } from '@ankhorage/utility/object';

import type {
  ApmLockedDependencyEdge,
  ApmLockedPackageEvidence,
  ApmStatusDiagnostic,
} from '../../../../types/status.js';
import type {
  ApmManagerInspectionInput,
  ApmManagerInspectionResult,
} from '../../../../types/status-inventory.js';
import { declarationResolutionKey } from '../../utils/declarationResolutionKey.js';
import { readInstalledPackageVersionAsync } from '../../utils/readInstalledPackageVersionAsync.js';

/*** Inspect npm package-lock v2/v3 plus physical node_modules package versions as read-only evidence. */
export async function inspectNpmRootAsync(
  input: ApmManagerInspectionInput,
): Promise<ApmManagerInspectionResult> {
  const candidate = input.root.lockfileCandidates.find(
    (item) => item.manager === 'npm' && item.fileName === 'package-lock.json',
  );
  if (candidate === undefined) return missingLockfile(input.root.id, 'package-lock.json');
  const parsed = JSON.parse(
    await readFile(path.join(input.root.rootPath, 'package-lock.json'), 'utf8'),
  ) as unknown;
  if (
    !isRecord(parsed) ||
    (parsed.lockfileVersion !== 2 && parsed.lockfileVersion !== 3) ||
    !isRecord(parsed.packages)
  ) {
    return unsupportedLockfile(input.root.id, candidate.path, parsed);
  }

  const locations = new Set(Object.keys(parsed.packages).filter((location) => location !== ''));
  const lockedPackages = Object.entries(parsed.packages).flatMap(([location, value]) =>
    location === '' || !isRecord(value) ? [] : [readNpmPackage(location, value, locations)],
  );
  const directResolutions = buildDirectResolutions(input, locations);
  const installedPackages = await Promise.all(
    lockedPackages.map((pkg) =>
      readInstalledPackageVersionAsync({
        packageId: pkg.id,
        packagePath: path.join(input.root.rootPath, pkg.location ?? pkg.id),
        source: 'node-modules',
        serializedLocation: pkg.location ?? pkg.id,
      }),
    ),
  );
  return {
    linker: 'node-modules',
    lockfile: {
      state: 'supported',
      path: candidate.path,
      format: 'npm-package-lock',
      version: String(parsed.lockfileVersion),
      evidence: [candidate.path],
    },
    lockedPackages,
    installedPackages,
    directResolutions,
    complete: true,
    diagnostics: [],
  };
}

/*** Resolve every direct declaration to npm's nearest physical lock location. */
function buildDirectResolutions(
  input: ApmManagerInspectionInput,
  locations: ReadonlySet<string>,
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const manifest of input.root.manifests) {
    const ownerLocation = portableRelative(input.root.rootPath, manifest.packageRoot);
    for (const name of declaredNames(manifest)) {
      const resolved = resolveNpmTarget(
        ownerLocation === '.' ? '' : ownerLocation,
        name,
        locations,
      );
      if (resolved !== undefined) {
        result.set(declarationResolutionKey(manifest.manifestPath, name), resolved);
      }
    }
  }
  return result;
}

/*** Convert one npm packages entry into a stable physical instance identity. */
function readNpmPackage(
  location: string,
  value: Record<string, unknown>,
  locations: ReadonlySet<string>,
): ApmLockedPackageEvidence {
  const name = typeof value.name === 'string' ? value.name : inferPackageName(location);
  const dependencies = readDependencyMap(value.dependencies).map(([dependencyName, requested]) => ({
    name: dependencyName,
    requested,
    ...optionalPackageId(resolveNpmTarget(location, dependencyName, locations)),
  }));
  const resolved = typeof value.resolved === 'string' ? value.resolved : undefined;
  return {
    id: location,
    name,
    ...(typeof value.version === 'string' ? { version: value.version } : {}),
    source: value.link === true ? 'workspace' : sourceFromResolved(resolved),
    optional: value.optional === true,
    location,
    dependencies,
  };
}

/*** Resolve Node's nearest physical dependency location without executing Node resolution hooks. */
function resolveNpmTarget(
  fromLocation: string,
  dependencyName: string,
  locations: ReadonlySet<string>,
): string | undefined {
  const search = [fromLocation];
  for (const current of search) {
    const candidate =
      current === ''
        ? `node_modules/${dependencyName}`
        : `${current}/node_modules/${dependencyName}`;
    if (locations.has(candidate)) return candidate;
    if (current === '') continue;
    const marker = current.lastIndexOf('/node_modules/');
    search.push(marker < 0 ? '' : current.slice(0, marker));
  }
  return undefined;
}

/*** Infer package identity from an npm physical location when the lock entry omits name. */
function inferPackageName(location: string): string {
  const marker = location.lastIndexOf('node_modules/');
  const tail = marker < 0 ? location : location.slice(marker + 'node_modules/'.length);
  const segments = tail.split('/');
  return tail.startsWith('@') ? segments.slice(0, 2).join('/') : (segments[0] ?? tail);
}

/*** Read string dependency edges from npm lock data. */
function readDependencyMap(value: unknown): readonly [string, string][] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([name, entryValue]) =>
    typeof entryValue === 'string' ? [[name, entryValue] as [string, string]] : [],
  );
}

/*** List declared names across package dependency sections for direct-lock resolution. */
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

/*** Preserve an edge without fabricating a target when npm evidence cannot resolve one. */
function optionalPackageId(
  packageId: string | undefined,
): Pick<ApmLockedDependencyEdge, 'packageId'> | object {
  return packageId === undefined ? {} : { packageId };
}

/*** Classify non-registry npm resolutions without treating them as semantic versions. */
function sourceFromResolved(resolved: string | undefined): ApmLockedPackageEvidence['source'] {
  if (resolved === undefined) return 'registry';
  if (resolved.startsWith('file:')) return 'file';
  if (resolved.startsWith('git+') || resolved.startsWith('github:')) return 'git';
  return 'registry';
}

/*** Normalize adapter-local path serialization with the shared Utility primitive. */
function portableRelative(root: string, target: string): string {
  const relative = toPortablePath(path.relative(root, target));
  return relative === '' ? '.' : relative;
}

/*** Return explicit missing-lock evidence rather than an empty successful inventory. */
function missingLockfile(rootId: string, fileName: string): ApmManagerInspectionResult {
  const diagnostic: ApmStatusDiagnostic = {
    code: 'status.lockfile.missing',
    severity: 'error',
    scope: { kind: 'install-root', id: rootId },
    evidence: [fileName],
    reason: `Selected npm install root has no ${fileName}.`,
    nextAction: 'Generate a lockfile with the selected package manager.',
  };
  return {
    linker: 'node-modules',
    lockfile: { state: 'missing', evidence: [fileName] },
    lockedPackages: [],
    installedPackages: [],
    directResolutions: new Map(),
    complete: false,
    diagnostics: [diagnostic],
  };
}

/*** Reject unsupported npm lock versions without guessing their semantics. */
function unsupportedLockfile(
  rootId: string,
  lockPath: string,
  parsed: unknown,
): ApmManagerInspectionResult {
  const version =
    isRecord(parsed) && typeof parsed.lockfileVersion === 'number'
      ? String(parsed.lockfileVersion)
      : undefined;
  return {
    linker: 'node-modules',
    lockfile: {
      state: 'unsupported',
      path: lockPath,
      format: 'npm-package-lock',
      ...(version === undefined ? {} : { version }),
      evidence: [lockPath],
    },
    lockedPackages: [],
    installedPackages: [],
    directResolutions: new Map(),
    complete: false,
    diagnostics: [
      {
        code: 'status.lockfile.npm.unsupported-version',
        severity: 'error',
        scope: { kind: 'install-root', id: rootId, path: lockPath },
        evidence: version === undefined ? [lockPath] : [`${lockPath}: lockfileVersion ${version}`],
        reason: 'APM status supports npm package-lock versions 2 and 3 only.',
        nextAction: 'Use a supported npm lock format or treat this project as inspection-only.',
      },
    ],
  };
}

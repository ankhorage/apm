import type { ProjectInspection } from '@ankhorage/project-detector/types';

import type {
  ApmDiscoveredInstallRoot,
  ApmManagerInspectionResult,
  ApmParsedPackageManifest,
} from '../../../types/status-inventory.js';
import type {
  ApmDependencyDeclaration,
  ApmDependencyInventory,
  ApmInstallRootInventory,
  ApmStatusDiagnostic,
} from '../../../types/status.js';
import { declarationResolutionKey } from '../utils/declarationResolutionKey.js';
import { discoverInstallRootsAsync } from './discoverInstallRootsAsync.js';
import { inspectBunRootAsync } from './inspectBunRootAsync.js';
import { inspectNpmRootAsync } from './inspectNpmRootAsync.js';
import { inspectPnpmRootAsync } from './inspectPnpmRootAsync.js';
import { inspectYarnRootAsync } from './inspectYarnRootAsync.js';
import { readPackageManifestAsync } from './readPackageManifestAsync.js';

/*** Inspect package declarations, lock instances, and installed state without running package code. */
export async function inspectDependencyInventoryAsync(input: {
  readonly inspection: ProjectInspection;
}): Promise<ApmDependencyInventory> {
  const manifestReads = await Promise.all(
    input.inspection.packages.map(async (pkg) => {
      try {
        return { manifest: await readPackageManifestAsync(input.inspection.rootPath, pkg.manifestPath) };
      } catch (error) {
        return {
          diagnostic: {
            code: 'status.manifest.unreadable',
            severity: 'error',
            scope: { kind: 'project', path: pkg.manifestPath },
            evidence: [pkg.manifestPath],
            reason: error instanceof Error ? error.message : 'Package manifest could not be read.',
            nextAction: 'Repair the package manifest before relying on dependency status.',
          } satisfies ApmStatusDiagnostic,
        };
      }
    }),
  );
  const manifests = manifestReads.flatMap((read) => ('manifest' in read ? [read.manifest] : []));
  const manifestDiagnostics = manifestReads.flatMap((read) =>
    'diagnostic' in read ? [read.diagnostic] : [],
  );
  if (manifests.length === 0) {
    const diagnostic: ApmStatusDiagnostic = {
      code: 'status.inventory.javascript-package-root-missing',
      severity: 'warning',
      scope: { kind: 'project' },
      evidence: input.inspection.manifests,
      reason: 'No JavaScript package manifest is available for APM dependency inventory.',
      nextAction: 'Treat detected non-JavaScript ecosystems as inspection-only until an adapter exists.',
    };
    return {
      roots: [],
      complete: false,
      diagnostics: [...manifestDiagnostics, diagnostic],
    };
  }
  const discoveredRoots = await discoverInstallRootsAsync(input.inspection, manifests);
  const roots = await Promise.all(discoveredRoots.map(inspectInstallRootAsync));
  const rootDiagnostics = roots.flatMap((root) => root.diagnostics);
  return {
    roots,
    complete:
      manifestDiagnostics.length === 0 &&
      roots.length > 0 &&
      roots.every((root) => root.complete),
    diagnostics: [...manifestDiagnostics, ...rootDiagnostics],
  };
}

/*** Delegate one selected install root to its package-manager-specific evidence adapter. */
async function inspectInstallRootAsync(root: ApmDiscoveredInstallRoot): Promise<ApmInstallRootInventory> {
  const managerResult = await inspectSelectedManagerAsync(root);
  const declarations = buildDeclarations(root.manifests, managerResult.directResolutions);
  const selectionComplete = root.manager.state === 'selected';
  const conflict = root.manager.state === 'conflict';
  return {
    id: root.id,
    rootPath: root.rootPath,
    packagePaths: root.manifests.map((manifest) => manifest.packageRoot),
    manager: root.manager,
    ...(managerResult.linker === undefined ? {} : { linker: managerResult.linker }),
    lockfile: conflict
      ? {
          state: 'conflict',
          evidence: root.lockfileCandidates.map((candidate) => candidate.path),
        }
      : managerResult.lockfile,
    declarations,
    lockedPackages: managerResult.lockedPackages,
    installedPackages: managerResult.installedPackages,
    complete: selectionComplete && managerResult.complete,
    diagnostics: [...root.diagnostics, ...managerResult.diagnostics],
  };
}

/*** Route selected manager evidence without a technical-layer service registry. */
async function inspectSelectedManagerAsync(
  root: ApmDiscoveredInstallRoot,
): Promise<ApmManagerInspectionResult> {
  if (root.manager.state !== 'selected' || root.manager.name === undefined) {
    return unavailableManagerResult(root);
  }
  if (root.manager.name === 'npm') return inspectNpmRootAsync({ root });
  if (root.manager.name === 'pnpm') return inspectPnpmRootAsync({ root });
  if (root.manager.name === 'yarn') return inspectYarnRootAsync({ root });
  return inspectBunRootAsync({ root });
}

/*** Build direct declaration evidence independently of lock and installed package states. */
function buildDeclarations(
  manifests: readonly ApmParsedPackageManifest[],
  resolutions: ReadonlyMap<string, string>,
): readonly ApmDependencyDeclaration[] {
  return manifests.flatMap((manifest) => [
    ...toDeclarations(manifest, manifest.dependencies, 'dependency', resolutions),
    ...toDeclarations(manifest, manifest.devDependencies, 'development', resolutions),
    ...toDeclarations(manifest, manifest.optionalDependencies, 'optional', resolutions),
    ...Object.entries(manifest.peerDependencies).map(([name, range]) => ({
      ownerPath: manifest.manifestPath,
      name,
      range,
      kind: manifest.optionalPeers.has(name) ? ('peer-optional' as const) : ('peer' as const),
      ...resolvedDeclaration(manifest.manifestPath, name, resolutions),
    })),
  ]);
}

/*** Convert one dependency map into immutable declaration evidence. */
function toDeclarations(
  manifest: ApmParsedPackageManifest,
  values: Readonly<Record<string, string>>,
  kind: 'dependency' | 'development' | 'optional',
  resolutions: ReadonlyMap<string, string>,
): readonly ApmDependencyDeclaration[] {
  return Object.entries(values).map(([name, range]) => ({
    ownerPath: manifest.manifestPath,
    name,
    range,
    kind,
    ...resolvedDeclaration(manifest.manifestPath, name, resolutions),
  }));
}

/*** Add resolved lock identity only when manager evidence established one. */
function resolvedDeclaration(
  ownerPath: string,
  name: string,
  resolutions: ReadonlyMap<string, string>,
): object {
  const resolvedPackageId = resolutions.get(declarationResolutionKey(ownerPath, name));
  return resolvedPackageId === undefined ? {} : { resolvedPackageId };
}

/*** Represent ambiguous/unknown manager selection as incomplete rather than empty success. */
function unavailableManagerResult(root: ApmDiscoveredInstallRoot): ApmManagerInspectionResult {
  return {
    lockfile: {
      state: root.manager.state === 'conflict' ? 'conflict' : 'missing',
      evidence: root.lockfileCandidates.map((candidate) => candidate.path),
    },
    lockedPackages: [],
    installedPackages: [],
    directResolutions: new Map(),
    complete: false,
    diagnostics: [],
  };
}

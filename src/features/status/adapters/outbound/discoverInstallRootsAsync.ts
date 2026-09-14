import path from 'node:path';

import type { ProjectInspection } from '@ankhorage/project-detector/types';
import { pathExists } from '@ankhorage/utility/node/fs';
import { toPortablePath } from '@ankhorage/utility/node/path';

import type {
  ApmDiscoveredInstallRoot,
  ApmLockfileCandidate,
  ApmParsedPackageManifest,
} from '../../../../types/status-inventory.js';
import type { ApmPackageManagerName, ApmStatusDiagnostic } from '../../../../types/status.js';
import { STATUS_LOCKFILES } from '../../constants/support.js';

/*** Resolve nested independent install roots and package-manager selection from filesystem evidence. */
export async function discoverInstallRootsAsync(
  inspection: ProjectInspection,
  manifests: readonly ApmParsedPackageManifest[],
): Promise<readonly ApmDiscoveredInstallRoot[]> {
  const rootEvidence = await Promise.all(
    manifests.map(async (manifest) => ({
      manifest,
      candidates: await discoverLockfilesAsync(inspection.rootPath, manifest),
      explicitManager: parsePackageManager(manifest.packageManager),
    })),
  );
  const potentialRoots = rootEvidence.filter(
    ({ manifest, candidates, explicitManager }) =>
      manifest.packageRoot === inspection.rootPath || candidates.length > 0 || explicitManager !== undefined,
  );
  if (potentialRoots.length === 0) return [];

  return potentialRoots.map(({ manifest, candidates, explicitManager }) => {
    const relativeRoot = portableRelative(inspection.rootPath, manifest.packageRoot);
    const roots = potentialRoots.map((item) => item.manifest.packageRoot);
    const assignedManifests = manifests.filter((candidate) =>
      ownsPackage(manifest.packageRoot, candidate.packageRoot, roots),
    );
    const selection = selectManager(relativeRoot, candidates, explicitManager, inspection);
    return {
      id: relativeRoot,
      rootPath: manifest.packageRoot,
      manager: selection.manager,
      lockfileCandidates: candidates,
      manifests: assignedManifests,
      diagnostics: selection.diagnostics,
    };
  });
}

/*** Discover known lockfile markers without reading or executing their contents. */
async function discoverLockfilesAsync(
  projectRoot: string,
  manifest: ApmParsedPackageManifest,
): Promise<readonly ApmLockfileCandidate[]> {
  const results = await Promise.all(
    STATUS_LOCKFILES.map(async (candidate) => {
      const absolutePath = path.join(manifest.packageRoot, candidate.fileName);
      if (!(await pathExists(absolutePath))) return undefined;
      return {
        manager: candidate.manager,
        fileName: candidate.fileName,
        path: portableRelative(projectRoot, absolutePath),
      } satisfies ApmLockfileCandidate;
    }),
  );
  return results.filter((result): result is ApmLockfileCandidate => result !== undefined);
}

/*** Select explicit manager metadata before lockfile and detector heuristics. */
function selectManager(
  relativeRoot: string,
  candidates: readonly ApmLockfileCandidate[],
  explicit: ParsedPackageManager | undefined,
  inspection: ProjectInspection,
): ManagerSelection {
  const lockManagers = [...new Set(candidates.map((candidate) => candidate.manager))];
  if (explicit !== undefined) return selectExplicitManager(relativeRoot, lockManagers, explicit);
  const [onlyLockManager] = lockManagers;
  if (lockManagers.length === 1 && onlyLockManager !== undefined) {
    return {
      manager: { state: 'selected', name: onlyLockManager, source: 'lockfile' },
      diagnostics: [],
    };
  }
  if (lockManagers.length > 1) return selectConflictingManagers(relativeRoot, lockManagers);
  return selectDetectedManager(relativeRoot, inspection);
}

interface ManagerSelection {
  readonly manager: ApmDiscoveredInstallRoot['manager'];
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

interface ParsedPackageManager {
  readonly name: ApmPackageManagerName;
  readonly version: string;
}

/*** Select packageManager metadata and report stale lockfiles from other managers. */
function selectExplicitManager(
  relativeRoot: string,
  lockManagers: readonly ApmPackageManagerName[],
  explicit: ParsedPackageManager,
): ManagerSelection {
  return {
    manager: {
      state: 'selected',
      name: explicit.name,
      version: explicit.version,
      source: 'package-manager-field',
    },
    diagnostics: lockManagers
      .filter((manager) => manager !== explicit.name)
      .map((manager) => managerConflictDiagnostic(relativeRoot, manager, explicit.name, false)),
  };
}

/*** Represent multiple lockfile managers as a blocking ambiguity. */
function selectConflictingManagers(
  relativeRoot: string,
  lockManagers: readonly ApmPackageManagerName[],
): ManagerSelection {
  return {
    manager: { state: 'conflict' },
    diagnostics: lockManagers.map((manager) =>
      managerConflictDiagnostic(relativeRoot, manager, undefined, true),
    ),
  };
}

/*** Fall back to Project Detector only for the project root when no lockfile selects a manager. */
function selectDetectedManager(relativeRoot: string, inspection: ProjectInspection): ManagerSelection {
  const detected = inspection.detection.packageManagers.filter(isSupportedManager);
  const [onlyDetectedManager] = detected;
  if (relativeRoot === '.' && detected.length === 1 && onlyDetectedManager !== undefined) {
    return {
      manager: { state: 'selected', name: onlyDetectedManager, source: 'project-detector' },
      diagnostics: [],
    };
  }
  return {
    manager: { state: 'unknown' },
    diagnostics: [unknownManagerDiagnostic(relativeRoot)],
  };
}

/*** Parse packageManager metadata without accepting unrelated tool names as APM support. */
function parsePackageManager(value: string | undefined): ParsedPackageManager | undefined {
  if (value === undefined) return undefined;
  const match = /^(npm|pnpm|yarn|bun)@([^+\s]+)(?:\+.+)?$/u.exec(value.trim());
  if (match === null) return undefined;
  const [, name, version] = match;
  if (name === undefined || version === undefined || !isSupportedManager(name)) return undefined;
  return { name, version };
}

/*** Limit detector/packageManager values to the managers with explicit APM adapters. */
function isSupportedManager(value: string): value is ApmPackageManagerName {
  return value === 'npm' || value === 'pnpm' || value === 'yarn' || value === 'bun';
}

/*** Assign a package to the nearest discovered install root, preserving nested independent apps. */
function ownsPackage(root: string, candidate: string, roots: readonly string[]): boolean {
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  return !roots.some(
    (nestedRoot) =>
      nestedRoot !== root &&
      isDescendant(root, nestedRoot) &&
      (nestedRoot === candidate || isDescendant(nestedRoot, candidate)),
  );
}

/*** Test path ancestry using Node path semantics rather than string-prefix matching. */
function isDescendant(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/*** Render stable POSIX relative paths with the shared Utility path primitive. */
function portableRelative(root: string, target: string): string {
  const relative = toPortablePath(path.relative(root, target));
  return relative === '' ? '.' : relative;
}

/*** Explain lockfile conflicts without allowing an ignored stale file to masquerade as selection. */
function managerConflictDiagnostic(
  rootId: string,
  lockManager: ApmPackageManagerName,
  selected: ApmPackageManagerName | undefined,
  blocking: boolean,
): ApmStatusDiagnostic {
  return {
    code: blocking ? 'status.manager.conflict' : 'status.manager.conflicting-lockfile-ignored',
    severity: blocking ? 'error' : 'warning',
    scope: { kind: 'install-root', id: rootId },
    evidence: [`${lockManager} lockfile`],
    reason:
      selected === undefined
        ? 'Multiple package-manager lockfiles exist and no explicit packageManager selects one.'
        : `The ${lockManager} lockfile is ignored because packageManager selects ${selected}.`,
    nextAction: blocking
      ? 'Remove stale lockfiles or declare the intended packageManager.'
      : 'Remove stale lockfiles to keep package-manager evidence unambiguous.',
  };
}

/*** Explain an install root whose package manager cannot be selected safely. */
function unknownManagerDiagnostic(relativeRoot: string): ApmStatusDiagnostic {
  return {
    code: 'status.manager.unknown',
    severity: 'warning',
    scope: { kind: 'install-root', id: relativeRoot },
    evidence: [],
    reason: 'No unambiguous supported package manager could be selected for this install root.',
    nextAction: 'Declare packageManager or keep exactly one supported package-manager lockfile.',
  };
}

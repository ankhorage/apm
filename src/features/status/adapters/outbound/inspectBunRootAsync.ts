import type {
  ApmManagerInspectionInput,
  ApmManagerInspectionResult,
} from '../../../../types/status-inventory.js';
import { inspectBunInstallationAsync } from './inspectBunInstallationAsync.js';
import { readBunLockEvidenceAsync } from './readBunLockEvidenceAsync.js';

/*** Compose Bun text-lock and installed-state evidence without invoking Bun. */
export async function inspectBunRootAsync(
  input: ApmManagerInspectionInput,
): Promise<ApmManagerInspectionResult> {
  const lockEvidence = await readBunLockEvidenceAsync(input);
  if (!lockEvidence.complete) {
    return {
      ...lockEvidence,
      linker: 'unknown',
      installedPackages: [],
    };
  }
  const installation = await inspectBunInstallationAsync(input, lockEvidence.lockedPackages);
  return {
    lockfile: lockEvidence.lockfile,
    lockedPackages: lockEvidence.lockedPackages,
    directResolutions: lockEvidence.directResolutions,
    linker: installation.linker,
    installedPackages: installation.installedPackages,
    complete: installation.complete,
    diagnostics: [...lockEvidence.diagnostics, ...installation.diagnostics],
  };
}

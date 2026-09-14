import type {
  ApmManagerInspectionInput,
  ApmManagerInspectionResult,
} from '../../../../types/status-inventory.js';
import { inspectPnpmInstallationAsync } from './inspectPnpmInstallationAsync.js';
import { readPnpmLockEvidenceAsync } from './readPnpmLockEvidenceAsync.js';

/*** Compose pnpm lock graph and installed-state evidence without executing project code. */
export async function inspectPnpmRootAsync(
  input: ApmManagerInspectionInput,
): Promise<ApmManagerInspectionResult> {
  const lockEvidence = await readPnpmLockEvidenceAsync(input);
  if (!lockEvidence.complete) {
    return {
      ...lockEvidence,
      linker: 'virtual-store',
      installedPackages: [],
    };
  }
  const installation = await inspectPnpmInstallationAsync(input, lockEvidence.lockedPackages);
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

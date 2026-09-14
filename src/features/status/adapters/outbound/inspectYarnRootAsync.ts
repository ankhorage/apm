import type {
  ApmManagerInspectionInput,
  ApmManagerInspectionResult,
} from '../../../../types/status-inventory.js';
import { inspectYarnInstallationAsync } from './inspectYarnInstallationAsync.js';
import { readYarnLockEvidenceAsync } from './readYarnLockEvidenceAsync.js';

/*** Compose Yarn lock graph and supported installation evidence without executing PnP code. */
export async function inspectYarnRootAsync(
  input: ApmManagerInspectionInput,
): Promise<ApmManagerInspectionResult> {
  const lockEvidence = await readYarnLockEvidenceAsync(input);
  if (!lockEvidence.complete) {
    return {
      ...lockEvidence,
      linker: 'unknown',
      installedPackages: [],
    };
  }
  const installation = await inspectYarnInstallationAsync(input, lockEvidence.lockedPackages);
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

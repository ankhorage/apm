import path from 'node:path';

import type { ApmApplyJournal, ApmApplyStepObservation } from '../../../../types/apply.js';
import type { ApmPlanResolvedPackage, ApmPlanStep } from '../../../../types/plan.js';
import type {
  ApmInstallRootInventory,
  ApmLockedPackageEvidence,
} from '../../../../types/status.js';
import { packageInstanceId } from '../../../../utils/packageInstanceId.js';
import { inspectApplyDependencyInventoryAsync } from './inspectApplyDependencyInventoryAsync.js';

/*** Observe whether the frozen lock graph is fully materialized for one reviewed install step. */
export async function observeNodeInstallStepAsync(
  journal: ApmApplyJournal,
  step: ApmPlanStep,
): Promise<ApmApplyStepObservation> {
  if (step.execution.kind !== 'install' || step.installRootId === undefined) {
    return invalidInstallObservation(step.id);
  }
  const inventory = await inspectApplyDependencyInventoryAsync(journal.rootPath);
  const root = inventory.roots.find(({ id }) => id === step.installRootId);
  if (root === undefined || !inventory.complete || !root.complete) {
    return {
      state: 'unknown',
      evidence: inventory.diagnostics.map(({ code }) => code),
      reason: 'Local dependency inventory is incomplete for the reviewed install root.',
    };
  }
  const rootConflict = installRootConflict(step, root);
  if (rootConflict !== undefined) return rootConflict;
  const expected = expectedPackages(journal, step.execution.packageIds);
  if (expected === undefined) return invalidInstallObservation(step.id);
  return packageObservation(root, step.installRootId, expected);
}

/*** Require the current install-root identity/manager/linker to match the frozen plan. */
function installRootConflict(
  step: ApmPlanStep,
  root: ApmInstallRootInventory,
): ApmApplyStepObservation | undefined {
  if (step.execution.kind !== 'install') return invalidInstallObservation(step.id);
  const managerMatches =
    root.manager.state === 'selected' && root.manager.name === step.execution.manager;
  const pathMatches = path.resolve(root.rootPath) === path.resolve(step.execution.installRootPath);
  const linkerMatches =
    step.execution.linker === undefined || root.linker === step.execution.linker;
  return managerMatches && pathMatches && linkerMatches
    ? undefined
    : {
        state: 'conflict',
        evidence: [
          root.id,
          root.rootPath,
          root.manager.name ?? 'unknown',
          root.linker ?? 'unknown',
        ],
        reason: 'Current install-root identity differs from the reviewed frozen install step.',
      };
}

/*** Resolve every package ID frozen into the install step back to its exact reviewed package evidence. */
function expectedPackages(
  journal: ApmApplyJournal,
  packageIds: readonly string[],
): readonly ApmPlanResolvedPackage[] | undefined {
  const byId = new Map(journal.plan.packages.map((pkg) => [pkg.id, pkg]));
  const packages = packageIds.map((id) => byId.get(id));
  return packages.every(isDefined) ? packages : undefined;
}

/*** Compare frozen package identities with current lock and installed evidence. */
function packageObservation(
  root: ApmInstallRootInventory,
  installRootId: string,
  expected: readonly ApmPlanResolvedPackage[],
): ApmApplyStepObservation {
  const lockedById = new Map(
    root.lockedPackages.map((pkg) => [packageInstanceId(installRootId, pkg.id), pkg]),
  );
  const classifications = expected.map((pkg) => classifyPackage(root, pkg, lockedById.get(pkg.id)));
  if (classifications.every((state) => state === 'satisfied')) {
    return { state: 'satisfied', evidence: expected.map(({ id }) => id) };
  }
  if (classifications.some((state) => state === 'conflict')) {
    return {
      state: 'conflict',
      evidence: expected.map(({ id }, index) => `${id}:${classifications[index] ?? 'unknown'}`),
      reason: 'Current lock evidence no longer matches the frozen package graph.',
    };
  }
  if (classifications.some((state) => state === 'unknown')) {
    return {
      state: 'unknown',
      evidence: expected.map(({ id }, index) => `${id}:${classifications[index] ?? 'unknown'}`),
      reason: 'Installed package evidence is incomplete for the frozen package graph.',
    };
  }
  return { state: 'pending', evidence: expected.map(({ id }) => id) };
}

type PackageState = 'satisfied' | 'pending' | 'unknown' | 'conflict';

/*** Classify one frozen package against current lock identity and installation state. */
function classifyPackage(
  root: ApmInstallRootInventory,
  expected: ApmPlanResolvedPackage,
  locked: ApmLockedPackageEvidence | undefined,
): PackageState {
  if (locked === undefined || !lockedMatches(expected, locked)) return 'conflict';
  const installed = root.installedPackages.find(({ packageId }) => packageId === locked.id);
  if (installed === undefined || installed.state === 'unknown') return 'unknown';
  if (installed.state === 'absent') return locked.optional ? 'satisfied' : 'pending';
  return expected.version === undefined || installed.version === expected.version
    ? 'satisfied'
    : 'pending';
}

/*** Require exact package name/version/source identity from the reviewed lock graph. */
function lockedMatches(
  expected: ApmPlanResolvedPackage,
  locked: ApmLockedPackageEvidence,
): boolean {
  return (
    expected.name === locked.name &&
    expected.version === locked.version &&
    expected.source === locked.source
  );
}

/*** Narrow exact reviewed package lookups. */
function isDefined(value: ApmPlanResolvedPackage | undefined): value is ApmPlanResolvedPackage {
  return value !== undefined;
}

/*** Report malformed in-memory plan/step linkage conservatively. */
function invalidInstallObservation(stepId: string): ApmApplyStepObservation {
  return {
    state: 'conflict',
    evidence: [stepId],
    reason: 'Reviewed install step cannot be resolved against the frozen plan package graph.',
  };
}

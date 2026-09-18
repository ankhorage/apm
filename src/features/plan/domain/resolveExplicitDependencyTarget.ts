import { compare, prerelease, satisfies, valid } from 'semver';

import type {
  ApmPlanBlocker,
  ApmPlanDependencyTarget,
  ApmPlanTargetSelection,
} from '../../../types/plan.js';
import type {
  ApmLockedPackageEvidence,
  ApmStatusDependency,
  ApmStatusResult,
} from '../../../types/status.js';

/*** Resolve and validate one explicit direct or transitive dependency target. */
export function resolveExplicitDependencyTarget(
  status: ApmStatusResult,
  dependency: ApmStatusDependency,
  selection: ApmPlanTargetSelection,
): { readonly target?: ApmPlanDependencyTarget; readonly blockers: readonly ApmPlanBlocker[] } {
  const source = lockedSource(status, dependency);
  if (source !== 'registry') return { blockers: [nonRegistryBlocker(dependency, source)] };
  if (!dependency.direct && selection.kind === 'compatible') {
    return { blockers: [transitiveCompatibleBlocker(dependency)] };
  }
  const targetVersion = selectedVersion(dependency, selection);
  if (targetVersion === undefined) {
    return { blockers: [unavailableTargetBlocker(dependency, selection.kind)] };
  }
  if (valid(targetVersion) === null)
    return { blockers: [invalidVersionBlocker(dependency, targetVersion)] };
  const { installed, lockedVersion } = dependency;
  const currentVersion = lockedVersion ?? installed.version;
  const policyBlockers = versionPolicyBlockers(
    dependency,
    selection,
    currentVersion,
    targetVersion,
  );
  if (policyBlockers.length > 0) return { blockers: policyBlockers };
  return directOrTransitiveTarget(dependency, selection, currentVersion, targetVersion);
}

/*** Preserve declaration semantics for direct targets while keeping transitive targets lock-only. */
function directOrTransitiveTarget(
  dependency: ApmStatusDependency,
  selection: ApmPlanTargetSelection,
  currentVersion: string | undefined,
  targetVersion: string,
): { readonly target?: ApmPlanDependencyTarget; readonly blockers: readonly ApmPlanBlocker[] } {
  const { declaration, direct, installRootId, name, packageId } = dependency;
  const base = {
    installRootId,
    packageId,
    name,
    direct,
    ...(currentVersion === undefined ? {} : { currentVersion }),
    targetVersion,
    source: selection.kind === 'version' ? ('exact' as const) : selection.kind,
    reason: `Explicit ${selection.kind} target selected for ${name}.`,
  };
  if (!direct) return { target: base, blockers: [] };
  if (declaration === undefined) return { blockers: [missingDeclarationBlocker(dependency)] };
  const targetRange = selectedRange(selection, declaration.range, targetVersion);
  if (!satisfies(targetVersion, targetRange, { includePrerelease: true })) {
    return { blockers: [invalidRangeBlocker(dependency, targetVersion, targetRange)] };
  }
  return {
    target: {
      ...base,
      ownerPath: declaration.ownerPath,
      kind: declaration.kind,
      currentRange: declaration.range,
      targetRange,
    },
    blockers: [],
  };
}

/*** Resolve one selected target version without inventing registry availability. */
function selectedVersion(
  dependency: ApmStatusDependency,
  selection: ApmPlanTargetSelection,
): string | undefined {
  if (selection.kind === 'version') return selection.version;
  const { compatibleVersion, latestVersion } = dependency.availability;
  return selection.kind === 'latest' ? latestVersion : compatibleVersion;
}

/*** Preserve an existing compatible range and otherwise use only an explicit or exact target range. */
function selectedRange(
  selection: ApmPlanTargetSelection,
  currentRange: string,
  targetVersion: string,
): string {
  if (satisfies(targetVersion, currentRange, { includePrerelease: true })) return currentRange;
  if (selection.kind === 'compatible') return currentRange;
  return selection.manifestRange ?? targetVersion;
}

/*** Enforce explicit prerelease and downgrade opt-ins before native resolution. */
function versionPolicyBlockers(
  dependency: ApmStatusDependency,
  selection: ApmPlanTargetSelection,
  currentVersion: string | undefined,
  targetVersion: string,
): readonly ApmPlanBlocker[] {
  const prereleaseBlocked =
    prerelease(targetVersion) !== null &&
    selection.kind !== 'compatible' &&
    selection.allowPrerelease !== true;
  const downgradeBlocked =
    currentVersion !== undefined &&
    valid(currentVersion) !== null &&
    compare(targetVersion, currentVersion) < 0 &&
    (selection.kind !== 'version' || selection.allowDowngrade !== true);
  return [
    ...(prereleaseBlocked
      ? [
          planBlocker(
            'plan.prerelease-not-allowed',
            dependency,
            targetVersion,
            'Prerelease target requires explicit opt-in.',
          ),
        ]
      : []),
    ...(downgradeBlocked
      ? [
          planBlocker(
            'plan.downgrade-not-allowed',
            dependency,
            targetVersion,
            'Downgrade target requires explicit opt-in.',
          ),
        ]
      : []),
  ];
}

/*** Locate the manager-native locked source behind one serialized status dependency identity. */
function lockedSource(
  status: ApmStatusResult,
  dependency: ApmStatusDependency,
): ApmLockedPackageEvidence['source'] | undefined {
  const root = status.installRoots.find((candidate) => candidate.id === dependency.installRootId);
  if (root === undefined) return undefined;
  const packageId =
    dependency.declaration?.resolvedPackageId ??
    resolveManagerPackageId(root.lockedPackages, dependency.installRootId, dependency.packageId);
  if (packageId === undefined) return undefined;
  return root.lockedPackages.find((pkg) => pkg.id === packageId)?.source;
}

/*** Resolve exact manager-native identity from either native or install-root-qualified status ids. */
function resolveManagerPackageId(
  lockedPackages: readonly ApmLockedPackageEvidence[],
  installRootId: string,
  packageId: string,
): string | undefined {
  if (lockedPackages.some((pkg) => pkg.id === packageId)) return packageId;
  const prefix = `${installRootId}::`;
  if (!packageId.startsWith(prefix)) return undefined;
  const nativePackageId = packageId.slice(prefix.length);
  return lockedPackages.some((pkg) => pkg.id === nativePackageId) ? nativePackageId : undefined;
}

/*** Block explicit updates for dependency sources whose native update semantics are not yet planned. */
function nonRegistryBlocker(
  dependency: ApmStatusDependency,
  source: ApmLockedPackageEvidence['source'] | undefined,
): ApmPlanBlocker {
  return planBlocker(
    'plan.non-registry-selection-unsupported',
    dependency,
    source ?? 'unknown',
    'Explicit dependency updates currently require a registry-backed package.',
  );
}

/*** Require exact/latest intent for a transitive package because no root declaration defines compatibility. */
function transitiveCompatibleBlocker(dependency: ApmStatusDependency): ApmPlanBlocker {
  return planBlocker(
    'plan.target-invalid',
    dependency,
    'compatible',
    'A transitive package has no root declaration range; select latest or an exact version explicitly.',
  );
}

/*** Report unavailable compatible/latest metadata without treating it as no update. */
function unavailableTargetBlocker(
  dependency: ApmStatusDependency,
  targetKind: ApmPlanTargetSelection['kind'],
): ApmPlanBlocker {
  return planBlocker(
    'plan.target-unavailable',
    dependency,
    targetKind,
    `No ${targetKind} target version is available in the selected status evidence.`,
  );
}

/*** Report malformed exact or registry versions before passing them to a native resolver. */
function invalidVersionBlocker(dependency: ApmStatusDependency, version: string): ApmPlanBlocker {
  return planBlocker(
    'plan.target-invalid',
    dependency,
    version,
    'Selected target is not an exact semantic version.',
  );
}

/*** Report a target range that does not actually admit the selected exact version. */
function invalidRangeBlocker(
  dependency: ApmStatusDependency,
  version: string,
  range: string,
): ApmPlanBlocker {
  return planBlocker(
    'plan.target-invalid',
    dependency,
    `${range} -> ${version}`,
    'Selected manifest range does not admit the selected exact version.',
  );
}

/*** Guard impossible direct dependency states that lost their declaration evidence. */
function missingDeclarationBlocker(dependency: ApmStatusDependency): ApmPlanBlocker {
  return planBlocker(
    'plan.target-invalid',
    dependency,
    dependency.name,
    'Direct package target has no declaration evidence.',
  );
}

/*** Build one stable package-scoped planning blocker. */
function planBlocker(
  code: ApmPlanBlocker['code'],
  dependency: ApmStatusDependency,
  evidence: string,
  reason: string,
): ApmPlanBlocker {
  return {
    code,
    scope: { kind: 'package', id: dependency.packageId },
    evidence: [evidence],
    reason,
  };
}

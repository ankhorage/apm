import { compare, prerelease, satisfies, valid } from 'semver';

import type {
  ApmPlanBlocker,
  ApmPlanDependencyTarget,
  ApmPlanPackageSelection,
  ApmPlanPolicy,
  ApmPlanTargetSelectionResult,
  ApmPlanTargetSelection,
} from '../../../types/plan.js';
import type { ApmLockedPackageEvidence, ApmStatusDependency, ApmStatusResult } from '../../../types/status.js';

/*** Select deterministic direct dependency targets from one immutable status snapshot and policy. */
export function selectDependencyTargets(
  status: ApmStatusResult,
  policy: ApmPlanPolicy,
): ApmPlanTargetSelectionResult {
  if (policy.dependencyUpdates === 'none') return { targets: [], blockers: [] };
  const direct = directDependencies(status);
  const explicit = explicitTargets(status, direct, policy.selections);
  const selectedKeys = new Set(explicit.targets.map(targetKey));
  const safe =
    policy.dependencyUpdates === 'safe'
      ? safeTargets(status, direct).filter((target) => !selectedKeys.has(targetKey(target)))
      : [];
  return {
    targets: [...explicit.targets, ...safe].sort(compareTargets),
    blockers: explicit.blockers,
  };
}

/*** Keep only direct dependencies with declaration evidence because transitive updates are resolver-owned. */
function directDependencies(status: ApmStatusResult): readonly ApmStatusDependency[] {
  return status.dependencies.filter(
    (dependency) => dependency.direct && dependency.declaration !== undefined,
  );
}

/*** Resolve every explicit selector without accepting ambiguous workspace matches. */
function explicitTargets(
  status: ApmStatusResult,
  dependencies: readonly ApmStatusDependency[],
  selections: readonly ApmPlanPackageSelection[],
): ApmPlanTargetSelectionResult {
  return selections.reduce<ApmPlanTargetSelectionResult>(
    (result, selection) => {
      const matches = dependencies.filter((dependency) => selectionMatches(dependency, selection));
      if (matches.length !== 1) {
        return {
          targets: result.targets,
          blockers: [...result.blockers, selectionMatchBlocker(selection, matches.length)],
        };
      }
      const dependency = matches[0];
      if (dependency === undefined) return result;
      const selected = explicitTarget(status, dependency, selection.target);
      return selected.target === undefined
        ? { targets: result.targets, blockers: [...result.blockers, ...selected.blockers] }
        : { targets: [...result.targets, selected.target], blockers: result.blockers };
    },
    { targets: [], blockers: [] },
  );
}

/*** Match one explicit package selector at declaration identity granularity. */
function selectionMatches(
  dependency: ApmStatusDependency,
  selection: ApmPlanPackageSelection,
): boolean {
  const declaration = dependency.declaration;
  if (declaration === undefined || dependency.name !== selection.selector.name) return false;
  if (
    selection.selector.installRootId !== undefined &&
    dependency.installRootId !== selection.selector.installRootId
  ) {
    return false;
  }
  return selection.selector.ownerPath === undefined || declaration.ownerPath === selection.selector.ownerPath;
}

/*** Build one explicit target or stable blockers from availability and policy evidence. */
function explicitTarget(
  status: ApmStatusResult,
  dependency: ApmStatusDependency,
  selection: ApmPlanTargetSelection,
): { readonly target?: ApmPlanDependencyTarget; readonly blockers: readonly ApmPlanBlocker[] } {
  const source = lockedSource(status, dependency);
  if (source !== 'registry') {
    return { blockers: [nonRegistryBlocker(dependency, source)] };
  }
  const targetVersion = selectedVersion(dependency, selection);
  if (targetVersion === undefined) return { blockers: [unavailableTargetBlocker(dependency, selection.kind)] };
  if (valid(targetVersion) === null) return { blockers: [invalidVersionBlocker(dependency, targetVersion)] };
  const currentVersion = dependency.lockedVersion ?? dependency.installed.version;
  const policyBlockers = versionPolicyBlockers(dependency, selection, currentVersion, targetVersion);
  if (policyBlockers.length > 0) return { blockers: policyBlockers };
  const declaration = dependency.declaration;
  if (declaration === undefined) return { blockers: [missingDeclarationBlocker(dependency)] };
  const targetRange = selectedRange(selection, declaration.range, targetVersion);
  if (!satisfies(targetVersion, targetRange, { includePrerelease: true })) {
    return { blockers: [invalidRangeBlocker(dependency, targetVersion, targetRange)] };
  }
  return {
    target: {
      installRootId: dependency.installRootId,
      packageId: dependency.packageId,
      ownerPath: declaration.ownerPath,
      name: dependency.name,
      kind: declaration.kind,
      currentRange: declaration.range,
      ...(currentVersion === undefined ? {} : { currentVersion }),
      targetVersion,
      targetRange,
      source: selection.kind === 'version' ? 'exact' : selection.kind,
      reason: `Explicit ${selection.kind} target selected for ${dependency.name}.`,
    },
    blockers: [],
  };
}

/*** Select conservative compatible updates without changing declared dependency ranges. */
function safeTargets(
  status: ApmStatusResult,
  dependencies: readonly ApmStatusDependency[],
): readonly ApmPlanDependencyTarget[] {
  return dependencies.flatMap((dependency) => {
    const declaration = dependency.declaration;
    const targetVersion = dependency.availability.compatibleVersion;
    const currentVersion = dependency.lockedVersion ?? dependency.installed.version;
    if (declaration === undefined || targetVersion === undefined || currentVersion === undefined) return [];
    if (lockedSource(status, dependency) !== 'registry') return [];
    if (valid(targetVersion) === null || valid(currentVersion) === null || compare(targetVersion, currentVersion) <= 0) {
      return [];
    }
    return [
      {
        installRootId: dependency.installRootId,
        packageId: dependency.packageId,
        ownerPath: declaration.ownerPath,
        name: dependency.name,
        kind: declaration.kind,
        currentRange: declaration.range,
        currentVersion,
        targetVersion,
        targetRange: declaration.range,
        source: 'compatible' as const,
        reason: `Newest registry version satisfying ${declaration.range}.`,
      },
    ];
  });
}

/*** Resolve one selected target version without inventing registry availability. */
function selectedVersion(
  dependency: ApmStatusDependency,
  selection: ApmPlanTargetSelection,
): string | undefined {
  if (selection.kind === 'version') return selection.version;
  return selection.kind === 'latest'
    ? dependency.availability.latestVersion
    : dependency.availability.compatibleVersion;
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
      ? [planBlocker('plan.prerelease-not-allowed', dependency, targetVersion, 'Prerelease target requires explicit opt-in.')]
      : []),
    ...(downgradeBlocked
      ? [planBlocker('plan.downgrade-not-allowed', dependency, targetVersion, 'Downgrade target requires explicit opt-in.')]
      : []),
  ];
}

/*** Locate the locked source kind for a status dependency instance. */
function lockedSource(
  status: ApmStatusResult,
  dependency: ApmStatusDependency,
): ApmLockedPackageEvidence['source'] | undefined {
  return status.installRoots
    .find((root) => root.id === dependency.installRootId)
    ?.lockedPackages.find((pkg) => pkg.id === dependency.packageId)?.source;
}

/*** Build an explicit selector cardinality blocker. */
function selectionMatchBlocker(
  selection: ApmPlanPackageSelection,
  count: number,
): ApmPlanBlocker {
  return {
    code: count === 0 ? 'plan.selection-not-found' : 'plan.selection-ambiguous',
    scope: { kind: 'package', id: selection.selector.name },
    evidence: [selection.selector.name, `matches:${count}`],
    reason: count === 0 ? 'Selected package declaration was not found.' : 'Selected package matches multiple declarations.',
    nextAction: 'Specify installRootId and ownerPath when the package name is not unique.',
  };
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
  return planBlocker('plan.target-invalid', dependency, version, 'Selected target is not an exact semantic version.');
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

/*** Build a stable declaration identity key for deduplication. */
function targetKey(target: ApmPlanDependencyTarget): string {
  return `${target.installRootId}\0${target.ownerPath}\0${target.name}`;
}

/*** Sort dependency targets independently of discovery/map iteration order. */
function compareTargets(left: ApmPlanDependencyTarget, right: ApmPlanDependencyTarget): number {
  return targetKey(left).localeCompare(targetKey(right));
}

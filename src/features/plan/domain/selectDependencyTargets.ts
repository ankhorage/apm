import { compare, prerelease, satisfies, valid } from 'semver';

import type {
  ApmPlanBlocker,
  ApmPlanDependencyTarget,
  ApmPlanPackageSelection,
  ApmPlanPolicy,
  ApmPlanTargetSelection,
  ApmPlanTargetSelectionResult,
} from '../../../types/plan.js';
import type {
  ApmLockedPackageEvidence,
  ApmStatusDependency,
  ApmStatusResult,
} from '../../../types/status.js';

/*** Select deterministic dependency targets from one immutable status snapshot and policy. */
export function selectDependencyTargets(
  status: ApmStatusResult,
  policy: ApmPlanPolicy,
): ApmPlanTargetSelectionResult {
  if (policy.dependencyUpdates === 'none') return { targets: [], blockers: [] };
  const explicit = explicitTargets(status, status.dependencies, policy.selections);
  const selectedKeys = new Set(explicit.targets.map(targetKey));
  const safe =
    policy.dependencyUpdates === 'safe'
      ? safeTargets(status).filter((target) => !selectedKeys.has(targetKey(target)))
      : [];
  return {
    targets: [...explicit.targets, ...safe].sort(compareTargets),
    blockers: explicit.blockers,
  };
}

/*** Resolve every explicit selector without accepting ambiguous workspace/package instances. */
function explicitTargets(
  status: ApmStatusResult,
  dependencies: readonly ApmStatusDependency[],
  selections: readonly ApmPlanPackageSelection[],
): ApmPlanTargetSelectionResult {
  return selections.reduce<ApmPlanTargetSelectionResult>(
    (result, selection) => appendExplicitTarget(status, dependencies, result, selection),
    { targets: [], blockers: [] },
  );
}

/*** Append one uniquely selected dependency target or its stable selector blocker. */
function appendExplicitTarget(
  status: ApmStatusResult,
  dependencies: readonly ApmStatusDependency[],
  result: ApmPlanTargetSelectionResult,
  selection: ApmPlanPackageSelection,
): ApmPlanTargetSelectionResult {
  const matches = dependencies.filter((dependency) => selectionMatches(dependency, selection));
  if (matches.length !== 1) {
    return {
      targets: result.targets,
      blockers: [...result.blockers, selectionMatchBlocker(selection, matches.length)],
    };
  }
  const [dependency] = matches;
  if (dependency === undefined) return result;
  const selected = explicitTarget(status, dependency, selection.target);
  return selected.target === undefined
    ? { targets: result.targets, blockers: [...result.blockers, ...selected.blockers] }
    : { targets: [...result.targets, selected.target], blockers: result.blockers };
}

/*** Match one explicit package selector at package-instance/declaration granularity. */
function selectionMatches(
  dependency: ApmStatusDependency,
  selection: ApmPlanPackageSelection,
): boolean {
  const { selector } = selection;
  const { declaration, installRootId, name, packageId } = dependency;
  if (name !== selector.name) return false;
  if (selector.packageId !== undefined && packageId !== selector.packageId) return false;
  if (selector.installRootId !== undefined && installRootId !== selector.installRootId) return false;
  if (selector.ownerPath === undefined) return true;
  return declaration?.ownerPath === selector.ownerPath;
}

/*** Build one explicit direct or transitive target from availability and policy evidence. */
function explicitTarget(
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
  if (valid(targetVersion) === null) return { blockers: [invalidVersionBlocker(dependency, targetVersion)] };
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

/*** Select conservative direct compatible updates without changing declared dependency ranges. */
function safeTargets(status: ApmStatusResult): readonly ApmPlanDependencyTarget[] {
  return status.dependencies.flatMap((dependency) => safeTarget(status, dependency));
}

/*** Convert one direct compatible status candidate into a safe plan target when it advances version. */
function safeTarget(
  status: ApmStatusResult,
  dependency: ApmStatusDependency,
): readonly ApmPlanDependencyTarget[] {
  const { availability, declaration, direct, installed, lockedVersion } = dependency;
  const { compatibleVersion } = availability;
  const currentVersion = lockedVersion ?? installed.version;
  if (!direct || declaration === undefined || compatibleVersion === undefined || currentVersion === undefined) {
    return [];
  }
  if (lockedSource(status, dependency) !== 'registry') return [];
  if (
    valid(compatibleVersion) === null ||
    valid(currentVersion) === null ||
    compare(compatibleVersion, currentVersion) <= 0
  ) {
    return [];
  }
  return [
    {
      installRootId: dependency.installRootId,
      packageId: dependency.packageId,
      ownerPath: declaration.ownerPath,
      name: dependency.name,
      direct: true,
      kind: declaration.kind,
      currentRange: declaration.range,
      currentVersion,
      targetVersion: compatibleVersion,
      targetRange: declaration.range,
      source: 'compatible',
      reason: `Newest registry version satisfying ${declaration.range}.`,
    },
  ];
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

/*** Locate the locked source kind for a status dependency instance. */
function lockedSource(
  status: ApmStatusResult,
  dependency: ApmStatusDependency,
): ApmLockedPackageEvidence['source'] | undefined {
  const root = status.installRoots.find((candidate) => candidate.id === dependency.installRootId);
  return root?.lockedPackages.find((pkg) => pkg.id === dependency.packageId)?.source;
}

/*** Build an explicit selector cardinality blocker. */
function selectionMatchBlocker(selection: ApmPlanPackageSelection, count: number): ApmPlanBlocker {
  return {
    code: count === 0 ? 'plan.selection-not-found' : 'plan.selection-ambiguous',
    scope: { kind: 'package', id: selection.selector.name },
    evidence: [selection.selector.name, `matches:${count}`],
    reason:
      count === 0
        ? 'Selected package instance was not found.'
        : 'Selected package matches multiple dependency instances.',
    nextAction: 'Specify packageId, installRootId or ownerPath until the selection is unique.',
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

/*** Build a stable package-instance target identity key for deduplication. */
function targetKey(target: ApmPlanDependencyTarget): string {
  return `${target.installRootId}\0${target.packageId}`;
}

/*** Sort dependency targets by stable package identity without locale-dependent ordering. */
function compareTargets(left: ApmPlanDependencyTarget, right: ApmPlanDependencyTarget): number {
  const leftKey = targetKey(left);
  const rightKey = targetKey(right);
  if (leftKey < rightKey) return -1;
  return leftKey > rightKey ? 1 : 0;
}

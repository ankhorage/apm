import { compare, valid } from 'semver';

import type {
  ApmPlanBlocker,
  ApmPlanDependencyTarget,
  ApmPlanPackageSelection,
  ApmPlanPolicy,
  ApmPlanTargetSelectionResult,
} from '../../../types/plan.js';
import type {
  ApmLockedPackageEvidence,
  ApmStatusDependency,
  ApmStatusResult,
} from '../../../types/status.js';
import { resolveExplicitDependencyTarget } from './resolveExplicitDependencyTarget.js';

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
  const selected = resolveExplicitDependencyTarget(status, dependency, selection.target);
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
  if (selector.installRootId !== undefined && installRootId !== selector.installRootId)
    return false;
  if (selector.ownerPath === undefined) return true;
  return declaration?.ownerPath === selector.ownerPath;
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
  if (
    !direct ||
    declaration === undefined ||
    compatibleVersion === undefined ||
    currentVersion === undefined
  ) {
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

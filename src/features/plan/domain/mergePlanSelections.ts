import type {
  ApmPlanBlocker,
  ApmPlanPackageSelection,
  ApmPlanPolicy,
} from '../../../types/plan.js';

/*** Merge owner-required dependency selections into one immutable effective planning policy. */
export function mergePlanSelections(
  policy: ApmPlanPolicy,
  requiredSelections: readonly ApmPlanPackageSelection[],
): PlanSelectionMergeResult {
  if (requiredSelections.length === 0) {
    return { policy, changed: false, blockers: [] };
  }
  if (policy.dependencyUpdates === 'none') {
    return {
      policy,
      changed: false,
      blockers: requiredSelections.map(policyForbidsSelectionBlocker),
    };
  }
  const merged = [...requiredSelections].sort(compareSelections).reduce<PlanSelectionMergeState>(
    (state, required) => mergeOneSelection(state, required),
    { selections: policy.selections, changed: false, blockers: [] },
  );
  return {
    policy: { ...policy, selections: [...merged.selections].sort(compareSelections) },
    changed: merged.changed,
    blockers: merged.blockers,
  };
}

interface PlanSelectionMergeResult {
  readonly policy: ApmPlanPolicy;
  readonly changed: boolean;
  readonly blockers: readonly ApmPlanBlocker[];
}

interface PlanSelectionMergeState {
  readonly selections: readonly ApmPlanPackageSelection[];
  readonly changed: boolean;
  readonly blockers: readonly ApmPlanBlocker[];
}

/*** Merge one selection without mutating prior policy or silently overriding an existing target. */
function mergeOneSelection(
  state: PlanSelectionMergeState,
  required: ApmPlanPackageSelection,
): PlanSelectionMergeState {
  const existing = state.selections.find(
    (selection) => selectorKey(selection) === selectorKey(required),
  );
  if (existing === undefined) {
    return { ...state, selections: [...state.selections, required], changed: true };
  }
  if (targetKey(existing) === targetKey(required)) return state;
  return {
    ...state,
    blockers: [...state.blockers, conflictingSelectionBlocker(existing, required)],
  };
}

/*** Block owner-driven dependency changes when the user explicitly disabled dependency updates. */
function policyForbidsSelectionBlocker(selection: ApmPlanPackageSelection): ApmPlanBlocker {
  return {
    code: 'plan.generator-selection-conflict',
    scope: { kind: 'package', id: selection.selector.name },
    evidence: [selectorKey(selection), targetKey(selection)],
    reason: 'Package-owned planning requires a dependency change but dependency updates are disabled.',
    nextAction: 'Allow selected dependency updates or keep the current package/projection state.',
  };
}

/*** Block conflicting user/owner targets instead of choosing one by iteration order. */
function conflictingSelectionBlocker(
  existing: ApmPlanPackageSelection,
  required: ApmPlanPackageSelection,
): ApmPlanBlocker {
  return {
    code: 'plan.generator-selection-conflict',
    scope: { kind: 'package', id: required.selector.name },
    evidence: [targetKey(existing), targetKey(required)],
    reason: 'Package-owned planning requires a target that conflicts with an existing selection.',
    nextAction: 'Choose a package target compatible with the owner requirement and re-plan.',
  };
}

/*** Serialize selector identity without depending on object property enumeration order. */
function selectorKey(selection: ApmPlanPackageSelection): string {
  const { selector } = selection;
  return [
    selector.name,
    selector.installRootId ?? '',
    selector.packageId ?? '',
    selector.ownerPath ?? '',
  ].join('\u0000');
}

/*** Serialize target policy identity for deterministic equality and blocker evidence. */
function targetKey(selection: ApmPlanPackageSelection): string {
  const { target } = selection;
  if (target.kind === 'compatible') return 'compatible';
  if (target.kind === 'latest') {
    return ['latest', target.manifestRange ?? '', String(target.allowPrerelease === true)].join(
      '\u0000',
    );
  }
  return [
    'version',
    target.version,
    target.manifestRange ?? '',
    String(target.allowPrerelease === true),
    String(target.allowDowngrade === true),
  ].join('\u0000');
}

/*** Sort selections by stable selector and target identity without locale-dependent behavior. */
function compareSelections(left: ApmPlanPackageSelection, right: ApmPlanPackageSelection): number {
  const leftKey = `${selectorKey(left)}\u0000${targetKey(left)}`;
  const rightKey = `${selectorKey(right)}\u0000${targetKey(right)}`;
  if (leftKey < rightKey) return -1;
  return leftKey > rightKey ? 1 : 0;
}

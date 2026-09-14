import path from 'node:path';

import { toPortablePath } from '@ankhorage/utility/node/path';

import type {
  ApmPlanBlocker,
  ApmPlanDependencyTarget,
  ApmPlanResolutionRequest,
} from '../../../../types/plan.js';
import type { ApmInstallRootInventory } from '../../../../types/status.js';

/*** Verify the native staged graph actually contains every reviewed exact target without promoting transitives. */
export function validateStagedPlanTargets(
  request: ApmPlanResolutionRequest,
  root: ApmInstallRootInventory,
): readonly ApmPlanBlocker[] {
  return request.targets.flatMap((target) =>
    target.direct
      ? validateDirectTarget(request, root, target)
      : validateTransitiveTarget(root, target),
  );
}

/*** Verify one direct target through its exact owner declaration and native resolved package ID. */
function validateDirectTarget(
  request: ApmPlanResolutionRequest,
  root: ApmInstallRootInventory,
  target: ApmPlanDependencyTarget,
): readonly ApmPlanBlocker[] {
  const { ownerPath } = target;
  if (ownerPath === undefined)
    return [targetMismatchBlocker(target, 'Direct target has no owner manifest.')];
  const stagedOwnerPath = ownerPathWithinInstallRoot(request, ownerPath);
  const declaration = root.declarations.find(
    (candidate) => candidate.ownerPath === stagedOwnerPath && candidate.name === target.name,
  );
  const resolved =
    declaration?.resolvedPackageId === undefined
      ? undefined
      : root.lockedPackages.find(({ id }) => id === declaration.resolvedPackageId);
  return resolved?.version === target.targetVersion
    ? []
    : [targetMismatchBlocker(target, resolved?.version ?? 'unresolved')];
}

/*** Verify one transitive target only when the native graph has one unambiguous package instance by name. */
function validateTransitiveTarget(
  root: ApmInstallRootInventory,
  target: ApmPlanDependencyTarget,
): readonly ApmPlanBlocker[] {
  const candidates = root.lockedPackages.filter(({ name }) => name === target.name);
  if (candidates.length !== 1) {
    return [
      {
        code: 'plan.selection-ambiguous',
        scope: { kind: 'package', id: target.packageId },
        evidence: [target.name, `resolved-instances:${candidates.length}`],
        reason:
          'Native resolution cannot prove which duplicate transitive package instance satisfies the reviewed target.',
        nextAction:
          'Use a package-manager constraint or update the owning direct dependency instead.',
      },
    ];
  }
  const [candidate] = candidates;
  return candidate?.version === target.targetVersion
    ? []
    : [targetMismatchBlocker(target, candidate?.version ?? 'unresolved')];
}

/*** Convert a project-relative owner manifest path to the staged install-root-relative manifest path. */
function ownerPathWithinInstallRoot(request: ApmPlanResolutionRequest, ownerPath: string): string {
  const absoluteOwner = path.isAbsolute(ownerPath)
    ? path.resolve(ownerPath)
    : path.resolve(request.rootPath, ownerPath);
  return toPortablePath(path.relative(path.resolve(request.installRootPath), absoluteOwner));
}

/*** Report native solver output that differs from the reviewed exact package target. */
function targetMismatchBlocker(target: ApmPlanDependencyTarget, actual: string): ApmPlanBlocker {
  return {
    code: 'plan.resolution-failed',
    scope: { kind: 'package', id: target.packageId },
    evidence: [target.targetVersion, actual],
    reason: 'Native package-manager resolution did not produce the exact reviewed target version.',
    nextAction: 'Review parent constraints, peer requirements, overrides or choose another target.',
  };
}

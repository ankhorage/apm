import type { ApmLockedPackageEvidence } from '../../../../types/status.js';
import type { ApmManagerInspectionInput } from '../../../../types/status-inventory.js';
import { declarationResolutionKey } from '../../utils/declarationResolutionKey.js';

/*** Resolve Bun lock identities reached by at least one mandatory manifest and dependency path. */
export function resolveBunRequiredPackageIds(
  input: ApmManagerInspectionInput,
  packages: readonly {
    readonly evidence: ApmLockedPackageEvidence;
    readonly requiredDependencyIds: readonly string[];
  }[],
  resolutions: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  const seeds = input.root.manifests.flatMap((manifest) =>
    requiredDeclarationNames(manifest).flatMap((name) => {
      const packageId = resolutions.get(declarationResolutionKey(manifest.manifestPath, name));
      return packageId === undefined ? [] : [packageId];
    }),
  );
  const byId = new Map(packages.map((pkg) => [pkg.evidence.id, pkg]));
  return expandRequiredPackageIds(new Set(seeds), byId);
}

/*** Expand mandatory reachability without traversing packages that may themselves be absent. */
function expandRequiredPackageIds(
  required: ReadonlySet<string>,
  packages: ReadonlyMap<
    string,
    {
      readonly evidence: ApmLockedPackageEvidence;
      readonly requiredDependencyIds: readonly string[];
    }
  >,
): ReadonlySet<string> {
  const next = new Set([
    ...required,
    ...[...required].flatMap((packageId) => {
      const pkg = packages.get(packageId);
      return pkg === undefined || pkg.evidence.optional ? [] : pkg.requiredDependencyIds;
    }),
  ]);
  return next.size === required.size ? required : expandRequiredPackageIds(next, packages);
}

/*** List direct declarations that require materialization rather than merely allowing it. */
function requiredDeclarationNames(
  manifest: ApmManagerInspectionInput['root']['manifests'][number],
): readonly string[] {
  const optionalNames = new Set(Object.keys(manifest.optionalDependencies));
  return [
    ...Object.keys(manifest.dependencies).filter((name) => !optionalNames.has(name)),
    ...Object.keys(manifest.devDependencies).filter((name) => !optionalNames.has(name)),
    ...Object.keys(manifest.peerDependencies).filter((name) => !manifest.optionalPeers.has(name)),
  ];
}

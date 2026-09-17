import type { ApmLockedPackageEvidence } from '../../../../types/status.js';
import type { ApmManagerInspectionInput } from '../../../../types/status-inventory.js';
import { parseBunPackagePath } from '../../domain/parseBunPackagePath.js';
import { declarationResolutionKey } from '../../utils/declarationResolutionKey.js';

/*** Resolve direct Bun declarations from root/workspace placement without global version guessing. */
export function readBunDirectResolutions(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): ReadonlyMap<string, string> {
  const placements = Object.fromEntries(packages.map((pkg) => [pkg.id.slice(4), pkg]));
  return new Map(
    input.root.manifests.flatMap((manifest) => {
      const names =
        manifest.packageRoot === input.root.rootPath
          ? []
          : manifest.name === undefined
            ? undefined
            : parseBunPackagePath(manifest.name);
      if (names === undefined) return [];
      return declarationPairs(manifest).flatMap(([name]) => {
        const resolved = resolveBunPackageId(names, name, placements);
        return resolved === undefined
          ? []
          : [[declarationResolutionKey(manifest.manifestPath, name), resolved] as const];
      });
    }),
  );
}

/*** Follow the nearest Bun placement while preserving nested and scoped instances. */
function resolveBunPackageId(
  from: readonly string[],
  name: string,
  packages: Readonly<Record<string, unknown>>,
): string | undefined {
  if (parseBunPackagePath(name)?.length !== 1) return undefined;
  const candidates = Array.from({ length: from.length + 1 }, (_, index) =>
    [...from.slice(0, from.length - index), name].join('/'),
  );
  const selected = candidates.find((candidate) => Object.hasOwn(packages, candidate));
  return selected === undefined ? undefined : `bun:${selected}`;
}

/*** List package declarations that Bun direct-resolution evidence can bind. */
function declarationPairs(
  manifest: ApmManagerInspectionInput['root']['manifests'][number],
): readonly [string, string][] {
  return [
    ...Object.entries(manifest.dependencies),
    ...Object.entries(manifest.devDependencies),
    ...Object.entries(manifest.optionalDependencies),
    ...Object.entries(manifest.peerDependencies),
  ];
}

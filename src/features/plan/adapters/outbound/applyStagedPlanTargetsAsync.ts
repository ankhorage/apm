import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolvePathWithinRoot, toPortablePath } from '@ankhorage/utility/node/path';
import { applyEdits, modify } from 'jsonc-parser';

import type { ApmPlanDependencyTarget, ApmPlanResolutionRequest } from '../../../../types/plan.js';
import type { ApmPlanStage } from '../../../../types/plan-staging.js';

/*** Apply reviewed direct ranges in staging and freeze the exact manifest content expected from the resolver. */
export async function applyStagedPlanTargetsAsync(
  request: ApmPlanResolutionRequest,
  stage: ApmPlanStage,
): Promise<ReadonlyMap<string, string>> {
  const byManifest = groupDirectTargets(request.targets);
  await Promise.all(
    [...byManifest.entries()].map(async ([ownerPath, targets]) => {
      const relativePath = stagedManifestPath(request, ownerPath);
      const manifestPath = resolvePathWithinRoot(stage.rootPath, relativePath);
      const content = await readFile(manifestPath, 'utf8');
      const updated = targets.reduce(applyTargetRange, content);
      await writeFile(manifestPath, updated, 'utf8');
    }),
  );
  return readManifestExpectationsAsync(stage);
}

/*** Group direct targets by owning package manifest while leaving transitive targets lock-only. */
function groupDirectTargets(
  targets: readonly ApmPlanDependencyTarget[],
): ReadonlyMap<string, readonly ApmPlanDependencyTarget[]> {
  return targets.reduce<Map<string, readonly ApmPlanDependencyTarget[]>>((groups, target) => {
    if (!target.direct || target.ownerPath === undefined || target.targetRange === undefined) return groups;
    const current = groups.get(target.ownerPath) ?? [];
    return new Map(groups).set(target.ownerPath, [...current, target]);
  }, new Map());
}

/*** Apply one selected dependency range using the declaration section already owned by status evidence. */
function applyTargetRange(content: string, target: ApmPlanDependencyTarget): string {
  const section = dependencySection(target.kind);
  if (section === undefined || target.targetRange === undefined) return content;
  return applyEdits(
    content,
    modify(content, [section, target.name], target.targetRange, {
      formattingOptions: formattingOptions(content),
    }),
  );
}

/*** Read every staged manifest after APM edits so native resolvers cannot add hidden dependencies. */
async function readManifestExpectationsAsync(stage: ApmPlanStage): Promise<ReadonlyMap<string, string>> {
  const manifests = stage.files.filter(
    ({ relativePath, role }) => role === 'mutable' && relativePath.endsWith('package.json'),
  );
  const entries = await Promise.all(
    manifests.map(async ({ relativePath, stagedPath }) => [relativePath, await readFile(stagedPath, 'utf8')] as const),
  );
  return new Map(entries);
}

/*** Map APM declaration kinds to their package.json owner field. */
function dependencySection(
  kind: ApmPlanDependencyTarget['kind'],
): 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies' | undefined {
  if (kind === 'dependency') return 'dependencies';
  if (kind === 'development') return 'devDependencies';
  if (kind === 'optional') return 'optionalDependencies';
  if (kind === 'peer' || kind === 'peer-optional') return 'peerDependencies';
  return undefined;
}

/*** Preserve the manifest's dominant indentation and line-ending style. */
function formattingOptions(content: string): {
  readonly insertSpaces: true;
  readonly tabSize: number;
  readonly eol: string;
} {
  const indentation = /\n( +)"/u.exec(content)?.[1]?.length ?? 2;
  return {
    insertSpaces: true,
    tabSize: indentation,
    eol: content.includes('\r\n') ? '\r\n' : '\n',
  };
}

/*** Resolve a project-relative owner manifest into the staged install-root layout. */
function stagedManifestPath(request: ApmPlanResolutionRequest, ownerPath: string): string {
  const absoluteOwner = path.isAbsolute(ownerPath)
    ? path.resolve(ownerPath)
    : path.resolve(request.rootPath, ownerPath);
  const relative = path.relative(path.resolve(request.installRootPath), absoluteOwner);
  resolvePathWithinRoot(request.installRootPath, relative);
  return toPortablePath(relative);
}

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolvePathWithinRoot, toPortablePath } from '@ankhorage/utility/node/path';
import { applyEdits, modify } from 'jsonc-parser';

import type { ApmPlanDependencyTarget, ApmPlanResolutionRequest } from '../../../../types/plan.js';
import type { ApmPlanStage } from '../../../../types/plan-staging.js';

/*** Freeze reviewed manifest expectations, then pin direct resolver input to exact target versions. */
export async function applyStagedPlanTargetsAsync(
  request: ApmPlanResolutionRequest,
  stage: ApmPlanStage,
): Promise<ReadonlyMap<string, string>> {
  const byManifest = groupDirectTargets(request.targets);
  await updateTargetManifestsAsync(request, stage, byManifest, applyTargetRange);
  const expectations = await readManifestExpectationsAsync(stage);
  await updateTargetManifestsAsync(request, stage, byManifest, applyTargetVersion);
  return expectations;
}

/*** Group direct targets by owning package manifest while leaving transitive targets lock-only. */
function groupDirectTargets(
  targets: readonly ApmPlanDependencyTarget[],
): ReadonlyMap<string, readonly ApmPlanDependencyTarget[]> {
  return targets.reduce<Map<string, readonly ApmPlanDependencyTarget[]>>((groups, target) => {
    if (!target.direct || target.ownerPath === undefined || target.targetRange === undefined)
      return groups;
    const current = groups.get(target.ownerPath) ?? [];
    return new Map(groups).set(target.ownerPath, [...current, target]);
  }, new Map());
}

/*** Apply one immutable target transform to every affected staged owner manifest. */
async function updateTargetManifestsAsync(
  request: ApmPlanResolutionRequest,
  stage: ApmPlanStage,
  byManifest: ReadonlyMap<string, readonly ApmPlanDependencyTarget[]>,
  update: (content: string, target: ApmPlanDependencyTarget) => string,
): Promise<void> {
  await Promise.all(
    [...byManifest.entries()].map(async ([ownerPath, targets]) => {
      const relativePath = stagedManifestPath(request, ownerPath);
      const manifestPath = resolvePathWithinRoot(stage.rootPath, relativePath);
      const content = await readFile(manifestPath, 'utf8');
      const updated = targets.reduce(update, content);
      await writeFile(manifestPath, updated, 'utf8');
    }),
  );
}

/*** Apply one reviewed dependency range to the staged manifest expectation. */
function applyTargetRange(content: string, target: ApmPlanDependencyTarget): string {
  return applyTargetValue(content, target, target.targetRange);
}

/*** Pin one direct dependency to the reviewed exact target only inside disposable resolver staging. */
function applyTargetVersion(content: string, target: ApmPlanDependencyTarget): string {
  return applyTargetValue(content, target, target.targetVersion);
}

/*** Apply one dependency value using the declaration section already owned by status evidence. */
function applyTargetValue(
  content: string,
  target: ApmPlanDependencyTarget,
  value: string | undefined,
): string {
  const section = dependencySection(target.kind);
  if (section === undefined || value === undefined) return content;
  return applyEdits(
    content,
    modify(content, [section, target.name], value, {
      formattingOptions: formattingOptions(content),
    }),
  );
}

/*** Read every reviewed staged manifest before exact solver-only constraints are applied. */
async function readManifestExpectationsAsync(
  stage: ApmPlanStage,
): Promise<ReadonlyMap<string, string>> {
  const manifests = stage.files.filter(
    ({ relativePath, role }) => role === 'mutable' && relativePath.endsWith('package.json'),
  );
  const entries = await Promise.all(
    manifests.map(
      async ({ relativePath, stagedPath }) =>
        [relativePath, await readFile(stagedPath, 'utf8')] as const,
    ),
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

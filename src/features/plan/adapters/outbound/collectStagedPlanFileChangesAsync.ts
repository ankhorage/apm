import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { toPortablePath } from '@ankhorage/utility/node/path';
import { isRecord } from '@ankhorage/utility/object';

import type {
  ApmPlanBlocker,
  ApmPlanFileChange,
  ApmPlanResolutionRequest,
} from '../../../../types/plan.js';
import type { ApmPlanStage, ApmPlanStageFile } from '../../../../types/plan-staging.js';

/*** Collect exact staged manifest/lock changes while rejecting unreviewed manager mutations. */
export async function collectStagedPlanFileChangesAsync(
  request: ApmPlanResolutionRequest,
  stage: ApmPlanStage,
  manifestExpectations: ReadonlyMap<string, string>,
): Promise<{
  readonly files: readonly ApmPlanFileChange[];
  readonly blockers: readonly ApmPlanBlocker[];
}> {
  const results = await Promise.all(
    stage.files.map((file) => inspectStagedFileAsync(request, file, manifestExpectations)),
  );
  return {
    files: results
      .flatMap(({ change }) => (change === undefined ? [] : [change]))
      .sort(compareChanges),
    blockers: results.flatMap(({ blocker }) => (blocker === undefined ? [] : [blocker])),
  };
}

interface StagedFileInspection {
  readonly change?: ApmPlanFileChange;
  readonly blocker?: ApmPlanBlocker;
}

/*** Compare one staged file to original content, keeping configuration and manifest intent guarded. */
async function inspectStagedFileAsync(
  request: ApmPlanResolutionRequest,
  file: ApmPlanStageFile,
  manifestExpectations: ReadonlyMap<string, string>,
): Promise<StagedFileInspection> {
  const afterContent = await readOptionalTextAsync(file.stagedPath);
  if (file.role === 'configuration') {
    return afterContent === file.beforeContent
      ? {}
      : { blocker: unreviewedFileMutationBlocker(request, file.relativePath, 'configuration') };
  }
  const expectedManifest = manifestExpectations.get(file.relativePath);
  if (expectedManifest !== undefined && afterContent !== expectedManifest) {
    return { blocker: unreviewedFileMutationBlocker(request, file.relativePath, 'manifest') };
  }
  if (afterContent === file.beforeContent) return {};
  return { change: exactFileChange(request, file, afterContent) };
}

/*** Convert one staged content transition to exact project-relative plan output. */
function exactFileChange(
  request: ApmPlanResolutionRequest,
  file: ApmPlanStageFile,
  afterContent: string | undefined,
): ApmPlanFileChange {
  return {
    path: projectRelativePath(request, file.relativePath),
    kind: changeKind(file.beforeContent, afterContent),
    ...(file.beforeContent === undefined
      ? {}
      : { beforeContent: file.beforeContent, beforeDigest: digest(file.beforeContent) }),
    ...(afterContent === undefined ? {} : { afterContent, afterDigest: digest(afterContent) }),
  };
}

/*** Read staged text while treating only absent output as a deleted or not-created file. */
async function readOptionalTextAsync(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

/*** Classify one exact file transition from original to staged content. */
function changeKind(
  beforeContent: string | undefined,
  afterContent: string | undefined,
): ApmPlanFileChange['kind'] {
  if (beforeContent === undefined) return 'create';
  return afterContent === undefined ? 'delete' : 'update';
}

/*** Serialize a staged install-root-relative path back into project-relative plan coordinates. */
function projectRelativePath(request: ApmPlanResolutionRequest, relativePath: string): string {
  const installRootRelative = toPortablePath(
    path.relative(path.resolve(request.rootPath), path.resolve(request.installRootPath)),
  );
  return installRootRelative === '' ? relativePath : `${installRootRelative}/${relativePath}`;
}

/*** Hash exact reviewed file content for stale-plan validation and human diff generation. */
function digest(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/*** Reject any package-manager mutation outside APM's reviewed manifest/lock intent. */
function unreviewedFileMutationBlocker(
  request: ApmPlanResolutionRequest,
  relativePath: string,
  role: 'configuration' | 'manifest',
): ApmPlanBlocker {
  return {
    code: 'plan.resolution-failed',
    scope: { kind: 'install-root', id: request.installRootId, path: relativePath },
    evidence: [relativePath, role],
    reason: `Native package-manager resolution modified a ${role} file outside the reviewed APM change.`,
    nextAction: 'Review package-manager behavior or model the file change explicitly before apply.',
  };
}

/*** Sort exact file changes by project-relative path. */
function compareChanges(left: ApmPlanFileChange, right: ApmPlanFileChange): number {
  if (left.path < right.path) return -1;
  return left.path > right.path ? 1 : 0;
}

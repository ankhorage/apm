import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { resolvePathWithinRoot, toPortablePath } from '@ankhorage/utility/node/path';
import { isRecord } from '@ankhorage/utility/object';

import type { ApmPlanResolutionRequest } from '../../../../types/plan.js';
import type { ApmPlanStage, ApmPlanStageFile } from '../../../../types/plan-staging.js';

const CONFIG_FILES = [
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  'pnpm-workspace.yaml',
  'pnpm-workspace.yml',
  'bunfig.toml',
] as const;

/*** Copy package-manager-relevant project evidence to an isolated planning workspace. */
export async function stagePlanInstallRootAsync(
  request: ApmPlanResolutionRequest,
): Promise<ApmPlanStage> {
  const stageRoot = await mkdtemp(path.join(tmpdir(), 'ankhorage-apm-plan-'));
  const mutablePaths = mutableRelativePaths(request);
  const mutableFiles = await Promise.all(
    mutablePaths.map((relativePath) =>
      stageFileAsync(request.installRootPath, stageRoot, relativePath, 'mutable'),
    ),
  );
  const configurationFiles = await Promise.all(
    CONFIG_FILES.map((relativePath) =>
      stageOptionalFileAsync(request.installRootPath, stageRoot, relativePath, 'configuration'),
    ),
  );
  return {
    rootPath: stageRoot,
    files: [
      ...mutableFiles,
      ...configurationFiles.flatMap((file) => (file === undefined ? [] : [file])),
    ],
  };
}

/*** Determine mutable manifests and the selected manager lockfile without copying application source. */
function mutableRelativePaths(request: ApmPlanResolutionRequest): readonly string[] {
  const manifestPaths = request.packagePaths.map((packagePath) => {
    const relativePackageRoot = relativeWithinRoot(request.installRootPath, packagePath, true);
    return relativePackageRoot === '' ? 'package.json' : `${relativePackageRoot}/package.json`;
  });
  const lockfilePath =
    request.lockfilePath === undefined
      ? managerLockfile(request.manager)
      : relativeWithinRoot(request.installRootPath, request.lockfilePath, false);
  return [...new Set(['package.json', ...manifestPaths, lockfilePath])].sort(compareText);
}

/*** Copy one mutable file when present while retaining missing-lockfile creation evidence. */
async function stageFileAsync(
  sourceRoot: string,
  stageRoot: string,
  relativePath: string,
  role: ApmPlanStageFile['role'],
): Promise<ApmPlanStageFile> {
  const sourcePath = resolvePathWithinRoot(sourceRoot, relativePath);
  const stagedPath = resolvePathWithinRoot(stageRoot, relativePath);
  const beforeContent = await readOptionalTextAsync(sourcePath);
  if (beforeContent !== undefined) await writeStagedTextAsync(stagedPath, beforeContent);
  return {
    relativePath: toPortablePath(relativePath),
    sourcePath,
    stagedPath,
    role,
    ...(beforeContent === undefined ? {} : { beforeContent }),
  };
}

/*** Copy one optional manager configuration file only when it exists. */
async function stageOptionalFileAsync(
  sourceRoot: string,
  stageRoot: string,
  relativePath: string,
  role: ApmPlanStageFile['role'],
): Promise<ApmPlanStageFile | undefined> {
  const sourcePath = resolvePathWithinRoot(sourceRoot, relativePath);
  const beforeContent = await readOptionalTextAsync(sourcePath);
  if (beforeContent === undefined) return undefined;
  const stagedPath = resolvePathWithinRoot(stageRoot, relativePath);
  await writeStagedTextAsync(stagedPath, beforeContent);
  return { relativePath, sourcePath, stagedPath, role, beforeContent };
}

/*** Write staged text after creating only the required package/config directory structure. */
async function writeStagedTextAsync(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

/*** Read UTF-8 text while treating only ENOENT as intentionally absent input evidence. */
async function readOptionalTextAsync(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

/*** Convert absolute or relative evidence paths to a safe portable descendant path. */
function relativeWithinRoot(rootPath: string, candidate: string, allowRoot: boolean): string {
  const absoluteCandidate = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(rootPath, candidate);
  const relative = path.relative(path.resolve(rootPath), absoluteCandidate);
  if (relative === '' && allowRoot) return '';
  resolvePathWithinRoot(rootPath, relative);
  return toPortablePath(relative);
}

/*** Map the selected manager to the lockfile it is expected to create in staging. */
function managerLockfile(manager: ApmPlanResolutionRequest['manager']): string {
  if (manager === 'npm') return 'package-lock.json';
  if (manager === 'pnpm') return 'pnpm-lock.yaml';
  if (manager === 'yarn') return 'yarn.lock';
  return 'bun.lock';
}

/*** Compare staging paths without locale-dependent ordering. */
function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

import { rm } from 'node:fs/promises';

import type {
  ApmPlanBlocker,
  ApmPlanResolutionPort,
  ApmPlanResolutionRequest,
  ApmPlanResolutionResult,
} from '../../../../types/plan.js';
import type {
  ApmPackageManagerPlanCommand,
  ApmPlanCommandResult,
} from '../../../../types/plan-staging.js';
import { applyStagedPlanTargetsAsync } from './applyStagedPlanTargetsAsync.js';
import { buildPackageManagerPlanCommands } from './buildPackageManagerPlanCommands.js';
import { collectStagedPlanFileChangesAsync } from './collectStagedPlanFileChangesAsync.js';
import { inspectStagedPlanInventoryAsync } from './inspectStagedPlanInventoryAsync.js';
import { runPlanCommandAsync } from './runPlanCommandAsync.js';
import { stagePlanInstallRootAsync } from './stagePlanInstallRootAsync.js';
import { toPlanResolutionGraph } from './toPlanResolutionGraph.js';
import { validateStagedPlanTargets } from './validateStagedPlanTargets.js';

/*** Create the Node native package-manager resolution adapter used by headless project planning. */
export function createNativePlanResolutionPort(): ApmPlanResolutionPort {
  return { resolveAsync: resolveNativePlanAsync };
}

/*** Resolve one install root entirely in disposable staging and return only reviewed serializable evidence. */
async function resolveNativePlanAsync(
  request: ApmPlanResolutionRequest,
): Promise<ApmPlanResolutionResult> {
  const stage = await stagePlanInstallRootAsync(request);
  try {
    const manifestExpectations = await applyStagedPlanTargetsAsync(request, stage);
    const versionResult = await runPlanCommandAsync(
      { executable: request.manager, args: ['--version'] },
      stage.rootPath,
    );
    if (versionResult.exitCode !== 0) {
      return failedResolution(request, [
        commandFailureBlocker(request, versionCommand(request), versionResult),
      ]);
    }
    const commands = buildPackageManagerPlanCommands(request);
    const commandResults = await runCommandsAsync(commands, stage.rootPath);
    const failed = firstFailedCommand(commands, commandResults);
    if (failed !== undefined) {
      return failedResolution(request, [
        commandFailureBlocker(request, failed.command, failed.result),
      ]);
    }
    const root = await inspectStagedPlanInventoryAsync(request, stage);
    if (root === undefined) return failedResolution(request, [stagedInventoryBlocker(request)]);
    const targetBlockers = validateStagedPlanTargets(request, root);
    const fileChanges = await collectStagedPlanFileChangesAsync(
      request,
      stage,
      manifestExpectations,
    );
    const graph = toPlanResolutionGraph(root, request.installRootId);
    const blockers = [...targetBlockers, ...fileChanges.blockers, ...graph.blockers];
    return {
      installRootId: request.installRootId,
      complete: blockers.length === 0,
      manager: request.manager,
      ...managerVersion(versionResult, request),
      ...(root.linker === undefined ? {} : { linker: root.linker }),
      files: fileChanges.files,
      packages: graph.packages,
      artifacts: graph.artifacts,
      effects: resolutionEffects(),
      blockers,
      diagnostics: root.diagnostics,
    };
  } finally {
    await rm(stage.rootPath, { recursive: true, force: true });
  }
}

/*** Execute native resolver commands sequentially so each consumes the preceding staged lock state. */
async function runCommandsAsync(
  commands: readonly ApmPackageManagerPlanCommand[],
  cwd: string,
): Promise<readonly ApmPlanCommandResult[]> {
  const [command, ...remaining] = commands;
  if (command === undefined) return [];
  const result = await runPlanCommandAsync(command, cwd);
  if (result.exitCode !== 0) return [result];
  return [result, ...(await runCommandsAsync(remaining, cwd))];
}

interface FailedCommand {
  readonly command: ApmPackageManagerPlanCommand;
  readonly result: ApmPlanCommandResult;
}

/*** Pair the first nonzero result with the command that produced it. */
function firstFailedCommand(
  commands: readonly ApmPackageManagerPlanCommand[],
  results: readonly ApmPlanCommandResult[],
): FailedCommand | undefined {
  const index = results.findIndex(({ exitCode }) => exitCode !== 0);
  if (index < 0) return undefined;
  const command = commands[index];
  const result = results[index];
  return command === undefined || result === undefined ? undefined : { command, result };
}

/*** Build the manager-version command as stable non-secret blocker evidence. */
function versionCommand(request: ApmPlanResolutionRequest): ApmPackageManagerPlanCommand {
  return { executable: request.manager, args: ['--version'] };
}

/*** Preserve the actual resolver version observed from the staging command. */
function managerVersion(
  result: ApmPlanCommandResult,
  request: ApmPlanResolutionRequest,
): Pick<ApmPlanResolutionResult, 'managerVersion'> | object {
  const actual = result.stdout.trim();
  const version = actual === '' ? request.managerVersion : actual;
  return version === undefined ? {} : { managerVersion: version };
}

/*** Return the declared planning effects for native lockfile-only resolution. */
function resolutionEffects(): ApmPlanResolutionResult['effects'] {
  return {
    projectWrites: false,
    lifecycleScripts: false,
    network: 'allowed',
    cache: 'manager-default',
  };
}

/*** Build one incomplete native result without leaking subprocess output or mutating project state. */
function failedResolution(
  request: ApmPlanResolutionRequest,
  blockers: readonly ApmPlanBlocker[],
): ApmPlanResolutionResult {
  return {
    installRootId: request.installRootId,
    complete: false,
    manager: request.manager,
    ...(request.managerVersion === undefined ? {} : { managerVersion: request.managerVersion }),
    ...(request.linker === undefined ? {} : { linker: request.linker }),
    files: [],
    packages: [],
    artifacts: [],
    effects: resolutionEffects(),
    blockers,
    diagnostics: [],
  };
}

/*** Classify native package-manager failures without embedding raw credential-bearing output. */
function commandFailureBlocker(
  request: ApmPlanResolutionRequest,
  command: ApmPackageManagerPlanCommand,
  result: ApmPlanCommandResult,
): ApmPlanBlocker {
  const peerConflict = /ERESOLVE|peer dependenc|peerDependencies/iu.test(result.stderr);
  return {
    code: peerConflict ? 'plan.peer-conflict' : 'plan.resolution-failed',
    scope: { kind: 'install-root', id: request.installRootId, path: request.installRootPath },
    evidence: [command.executable, ...command.args, `exit:${result.exitCode}`],
    reason: peerConflict
      ? 'Native package-manager resolution rejected the selected graph because peer requirements conflict.'
      : 'Native package-manager planning command failed before producing a complete reviewed lock graph.',
    nextAction: peerConflict
      ? 'Choose compatible package targets or resolve the peer constraint explicitly.'
      : 'Run the package manager manually for full diagnostics, then re-run APM status and plan.',
  };
}

/*** Report a staged graph that cannot be parsed through the already supported status adapter matrix. */
function stagedInventoryBlocker(request: ApmPlanResolutionRequest): ApmPlanBlocker {
  return {
    code: 'plan.resolution-failed',
    scope: { kind: 'install-root', id: request.installRootId, path: request.installRootPath },
    evidence: [request.manager],
    reason:
      'Native package-manager output could not be re-inspected as a complete supported lock graph.',
    nextAction: 'Use a supported lockfile/linker mode before applying updates.',
  };
}

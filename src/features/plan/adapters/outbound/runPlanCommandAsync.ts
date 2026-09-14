import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { isRecord } from '@ankhorage/utility/object';

import type {
  ApmPackageManagerPlanCommand,
  ApmPlanCommandResult,
} from '../../../../types/plan-staging.js';

const execFileAsync = promisify(execFile);
const MAX_BUFFER_BYTES = 64 * 1024;
const COMMAND_TIMEOUT_MS = 120_000;

/*** Execute one native package-manager planning command without a shell and with bounded output/time. */
export async function runPlanCommandAsync(
  command: ApmPackageManagerPlanCommand,
  cwd: string,
): Promise<ApmPlanCommandResult> {
  try {
    const result = await execFileAsync(command.executable, [...command.args], {
      cwd,
      env: commandEnvironment(),
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER_BYTES,
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      exitCode: commandExitCode(error),
      stdout: commandOutput(error, 'stdout'),
      stderr: commandOutput(error, 'stderr'),
    };
  }
}

/*** Disable lifecycle scripts/colors at the process edge without changing user project configuration. */
function commandEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NO_COLOR: '1',
    npm_config_ignore_scripts: 'true',
    YARN_ENABLE_SCRIPTS: 'false',
  };
}

/*** Read a numeric child exit code without trusting the shape of an external process error. */
function commandExitCode(error: unknown): number {
  if (!isRecord(error)) return 1;
  return typeof error.code === 'number' ? error.code : 1;
}

/*** Read bounded child output from an external process error without dynamic object indexing. */
function commandOutput(error: unknown, field: 'stdout' | 'stderr'): string {
  if (!isRecord(error)) return '';
  const value = field === 'stdout' ? error.stdout : error.stderr;
  return typeof value === 'string' ? value.slice(0, MAX_BUFFER_BYTES) : '';
}

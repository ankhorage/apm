import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { isRecord } from '@ankhorage/utility/object';

import type {
  ApmPackageManagerCommand,
  ApmPackageManagerCommandOptions,
  ApmPackageManagerCommandResult,
} from '../types/package-manager-command.js';

const execFileAsync = promisify(execFile);
const MAX_BUFFER_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

/*** Run one package-manager command without a shell, with bounded output and explicit script policy. */
export async function runPackageManagerCommandAsync(
  command: ApmPackageManagerCommand,
  cwd: string,
  options: ApmPackageManagerCommandOptions,
): Promise<ApmPackageManagerCommandResult> {
  try {
    const result = await execFileAsync(command.executable, [...command.args], {
      cwd,
      env: commandEnvironment(options.lifecycleScripts),
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER_BYTES,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
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

/*** Build the subprocess environment without silently enabling lifecycle scripts disabled by the host. */
function commandEnvironment(lifecycleScripts: boolean): NodeJS.ProcessEnv {
  return lifecycleScripts
    ? { ...process.env, NO_COLOR: '1' }
    : {
        ...process.env,
        NO_COLOR: '1',
        npm_config_ignore_scripts: 'true',
        YARN_ENABLE_SCRIPTS: 'false',
      };
}

/*** Read a numeric child exit code without trusting an external process error shape. */
function commandExitCode(error: unknown): number {
  if (!isRecord(error)) return 1;
  return typeof error.code === 'number' ? error.code : 1;
}

/*** Read bounded child output without dynamic object indexing. */
function commandOutput(error: unknown, field: 'stdout' | 'stderr'): string {
  if (!isRecord(error)) return '';
  const value = field === 'stdout' ? error.stdout : error.stderr;
  return typeof value === 'string' ? value.slice(0, MAX_BUFFER_BYTES) : '';
}

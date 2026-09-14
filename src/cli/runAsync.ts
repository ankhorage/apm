#!/usr/bin/env node
import type { ApmCliContext } from '../types/cli.js';
import { apply } from './commands/apply.js';
import { plan } from './commands/plan.js';
import { status } from './commands/status.js';
import { verify } from './commands/verify.js';

/***
 * Run standalone `apm status|plan|apply|verify` commands.
 *
 * Exit codes are 0 for success, 1 for invalid invocation/unhandled execution errors, 2 for
 * blocked/incomplete/unverified outcomes, 4 for a known failed apply, 5 for cancellation, and 6
 * when explicit recovery is required. `--json` requests stable machine-readable command output.
 * Apply starts from `--plan <plan.json>` or resumes with `--resume <operationId> [directory]`;
 * verify selects a durable operation with `--operation <operationId> [directory]`.
 * @readme
 */
export async function runAsync(argv: readonly string[], context: ApmCliContext): Promise<number> {
  try {
    const [command, ...args] = argv;
    if (command === '--help' || command === 'help' || command === undefined) {
      context.writeStdout(HELP_TEXT);
      return 0;
    }
    if (command === 'status') return await status.executeAsync(args, context);
    if (command === 'plan') return plan.executeAsync(args, context);
    if (command === 'apply') return apply.executeAsync(args, context);
    if (command === 'verify') return verify.executeAsync(args, context);
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    context.writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

const HELP_TEXT = `Usage:
  apm status [directory] [--json] [--offline]
  apm plan [directory] [--json] [--offline]
  apm apply (--plan <plan.json> | --resume <operationId> [directory]) [--json] [--allow-owner-code] [--allow-lifecycle-scripts] [--allow-external-effects]
  apm verify --operation <operationId> [directory] [--json]

Exit codes:
  0 success
  1 invalid invocation or unhandled execution error
  2 blocked, incomplete, or unverified
  4 known apply failure
  5 apply cancelled
  6 explicit recovery required
`;

if (import.meta.main) {
  process.exitCode = await runAsync(process.argv.slice(2), {
    cwd: process.cwd(),
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
  });
}

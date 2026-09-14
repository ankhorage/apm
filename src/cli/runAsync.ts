#!/usr/bin/env node
import type { ApmCliContext } from '../types/cli.js';
import { apply } from './commands/apply.js';
import { plan } from './commands/plan.js';
import { status } from './commands/status.js';
import { verify } from './commands/verify.js';

/***
 * Run standalone `apm status|plan|apply|verify` commands.
 *
 * Exit codes are 0 for success, 1 for invalid invocation/execution failure, 2 for incomplete status
 * evidence, and 3 for a reserved operation that is not implemented yet. `--json` requests stable
 * machine-readable command output; human status output is the default.
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

const HELP_TEXT = `Usage: apm <status|plan|apply|verify> [directory] [--json]\n\nExit codes:\n  0 success\n  1 invalid invocation or execution failure\n  2 incomplete status evidence\n  3 operation reserved but not implemented\n`;

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

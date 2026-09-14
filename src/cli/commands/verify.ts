import path from 'node:path';

import { verifyProjectAsync } from '../../features/verify/composition/verifyProjectAsync.js';
import type { ApmCliCommand } from '../../types/cli.js';
import type { ApmVerifyResult } from '../../types/verify.js';

/*** Map durable operation selection to the shared Node verification use case. */
export const verify = {
  path: ['verify'],
  capability: 'apm.verify',
  summary: 'Verify the applied dependency graph, migrations, projections, and required checks.',
  executeAsync: async (argv, context) => {
    const parsed = parseVerifyArguments(argv);
    const result = await verifyProjectAsync({
      rootPath: path.resolve(context.cwd, parsed.rootPath),
      operationId: parsed.operationId,
    });
    renderResult(result, parsed.json, context.writeStdout);
    return result.verified ? 0 : 2;
  },
} satisfies ApmCliCommand;

interface ParsedVerifyArguments {
  readonly rootPath: string;
  readonly operationId: string;
  readonly json: boolean;
}

/*** Parse one explicit durable operation ID plus optional project directory. */
function parseVerifyArguments(argv: readonly string[]): ParsedVerifyArguments {
  const operationIndex = argv.indexOf('--operation');
  if (operationIndex < 0 || argv.lastIndexOf('--operation') !== operationIndex) usageError();
  const operationId = argv[operationIndex + 1];
  if (operationId === undefined || operationId.startsWith('-')) usageError();
  const json = argv.includes('--json');
  const positionals = argv.filter(
    (argument, index) =>
      argument !== '--json' && index !== operationIndex && index !== operationIndex + 1,
  );
  if (positionals.length > 1 || positionals.some((argument) => argument.startsWith('-'))) usageError();
  return { operationId, rootPath: positionals[0] ?? '.', json };
}

/*** Render structured or compact verification evidence without changing verify semantics. */
function renderResult(
  result: ApmVerifyResult,
  json: boolean,
  writeStdout: (value: string) => void,
): void {
  if (json) {
    writeStdout(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  writeStdout(
    [
      `APM verify: ${result.verified ? 'verified' : 'failed'}`,
      `Root: ${result.rootPath}`,
      `Operation ID: ${result.operationId}`,
      ...(result.planId === undefined ? [] : [`Plan ID: ${result.planId}`]),
      `Checks: ${result.checks.length}`,
      `Follow-up: ${result.followUp.length}`,
    ].join('\n') + '\n',
  );
}

/*** Throw the canonical verify usage error from every invalid argument shape. */
function usageError(): never {
  throw new Error('Usage: apm verify --operation <operationId> [directory] [--json]');
}

import type { ApmCliContext, ApmUnavailableOperation } from '../types/cli.js';

/*** Render a reserved operation as an explicit non-success until its owning roadmap issue lands. */
export function renderUnavailableOperation(
  operation: ApmUnavailableOperation,
  issueNumber: number,
  argv: readonly string[],
  context: ApmCliContext,
): number {
  const result = {
    schemaVersion: 1,
    operation,
    status: 'unavailable',
    code: 'operation-not-implemented',
    message: `APM ${operation} is reserved but not implemented by the bootstrap; see APM #${issueNumber}.`,
  } as const;

  if (argv.includes('--json')) {
    context.writeStdout(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    context.writeStderr(`${result.message}\n`);
  }

  return 3;
}

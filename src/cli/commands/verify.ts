import type { ApmCliCommand } from '../../types/cli.js';
import { renderUnavailableOperation } from '../renderUnavailableOperation.js';

/*** Reserve the verify command without reporting false success before update verification exists. */
export const verify = {
  path: ['verify'],
  capability: 'apm.verify',
  summary: 'Verify the applied dependency graph, migrations, projections, and required checks.',
  executeAsync: (argv, context) => renderUnavailableOperation('verify', 6, argv, context),
} satisfies ApmCliCommand;

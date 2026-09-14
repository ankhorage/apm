import type { ApmCliCommand } from '../../types/cli.js';
import { renderUnavailableOperation } from '../renderUnavailableOperation.js';

/*** Reserve the plan command without reporting false success before deterministic planning exists. */
export const plan = {
  path: ['plan'],
  capability: 'apm.plan',
  summary: 'Resolve a concrete reviewable update plan without mutating the project.',
  executeAsync: (argv, context) => renderUnavailableOperation('plan', 5, argv, context),
} satisfies ApmCliCommand;

import type { ApmCliCommand } from '../../types/cli.js';
import { renderUnavailableOperation } from '../renderUnavailableOperation.js';

/*** Reserve the apply command without reporting false success before execution/recovery exists. */
export const apply = {
  path: ['apply'],
  capability: 'apm.apply',
  summary: 'Apply a selected still-valid update plan with recovery semantics.',
  executeAsync: (argv, context) => renderUnavailableOperation('apply', 6, argv, context),
} satisfies ApmCliCommand;

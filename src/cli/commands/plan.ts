import path from 'node:path';

import { planProjectAsync } from '../../features/plan/composition/planProjectAsync.js';
import type { ApmCliCommand } from '../../types/cli.js';

/*** Map plan flags to the shared project planning use case and render terminal output only here. */
export const plan = {
  path: ['plan'],
  capability: 'apm.plan',
  summary: 'Resolve a concrete reviewable update plan without mutating the project.',
  executeAsync: async (argv, context) => {
    const json = argv.includes('--json');
    const offline = argv.includes('--offline');
    const positionals = argv.filter(
      (argument) => argument !== '--json' && argument !== '--offline',
    );
    const invalidFlag = positionals.find((argument) => argument.startsWith('-'));
    if (positionals.length > 1 || invalidFlag !== undefined) {
      throw new Error('Usage: apm plan [directory] [--json] [--offline]');
    }

    const result = await planProjectAsync({
      rootPath: path.resolve(context.cwd, positionals[0] ?? '.'),
      availability: offline ? 'offline' : 'refresh',
    });

    if (json) {
      context.writeStdout(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      context.writeStdout(
        [
          `APM plan: ${result.complete ? 'ready' : 'blocked'}`,
          `Root: ${result.rootPath}`,
          `Plan ID: ${result.id}`,
          `Targets: ${result.targets.length}`,
          `File changes: ${result.files.length}`,
          `Steps: ${result.steps.length}`,
          `Blockers: ${result.blockers.length}`,
        ].join('\n') + '\n',
      );
    }

    return result.complete ? 0 : 2;
  },
} satisfies ApmCliCommand;

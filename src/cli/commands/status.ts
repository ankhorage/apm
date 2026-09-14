import path from 'node:path';

import { statusProjectAsync } from '../../features/status/composition/statusProjectAsync.js';
import type { ApmCliCommand } from '../../types/cli.js';

/*** Map the status command to the shared status use case and CLI-specific rendering. */
export const status = {
  path: ['status'],
  capability: 'apm.status',
  summary: 'Inspect current project evidence without mutating the project.',
  executeAsync: async (argv, context) => {
    const json = argv.includes('--json');
    const positionals = argv.filter((argument) => argument !== '--json');
    const invalidFlag = positionals.find((argument) => argument.startsWith('-'));
    if (positionals.length > 1 || invalidFlag !== undefined) {
      throw new Error('Usage: apm status [directory] [--json]');
    }

    const result = await statusProjectAsync({
      rootPath: path.resolve(context.cwd, positionals[0] ?? '.'),
    });

    if (json) {
      context.writeStdout(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      context.writeStdout(
        [
          `APM status: ${result.complete ? 'complete' : 'incomplete'}`,
          `Root: ${result.rootPath}`,
          `Package managers: ${result.project.packageManagers.join(', ') || 'unknown'}`,
          `Packages: ${result.project.packageCount}`,
          `Workspaces: ${result.project.workspaceCount}`,
        ].join('\n') + '\n',
      );
    }

    return result.complete ? 0 : 2;
  },
} satisfies ApmCliCommand;

import path from 'node:path';

import { statusProjectAsync } from '../../features/status/composition/statusProjectAsync.js';
import type { ApmCliCommand } from '../../types/cli.js';

/*** Map status flags to the shared use case and keep terminal rendering outside domain evidence. */
export const status = {
  path: ['status'],
  capability: 'apm.status',
  summary: 'Inspect dependency, installation, projection, migration and availability evidence.',
  executeAsync: async (argv, context) => {
    const json = argv.includes('--json');
    const offline = argv.includes('--offline');
    const positionals = argv.filter((argument) => argument !== '--json' && argument !== '--offline');
    const invalidFlag = positionals.find((argument) => argument.startsWith('-'));
    if (positionals.length > 1 || invalidFlag !== undefined) {
      throw new Error('Usage: apm status [directory] [--json] [--offline]');
    }

    const result = await statusProjectAsync({
      rootPath: path.resolve(context.cwd, positionals[0] ?? '.'),
      availability: offline ? 'offline' : 'refresh',
    });

    if (json) {
      context.writeStdout(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      context.writeStdout(
        [
          `APM status: ${result.currency}`,
          `Evidence: ${result.complete ? 'complete' : 'incomplete'}`,
          `Root: ${result.rootPath}`,
          `Install roots: ${result.installRoots.length}`,
          `Dependency instances: ${result.dependencies.length}`,
          `Findings: ${result.findings.length}`,
        ].join('\n') + '\n',
      );
    }

    return result.complete ? 0 : 2;
  },
} satisfies ApmCliCommand;

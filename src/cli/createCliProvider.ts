import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';

import { apply } from './commands/apply.js';
import { plan } from './commands/plan.js';
import { status } from './commands/status.js';
import { verify } from './commands/verify.js';
import { runAsync } from './runAsync.js';

/*** Create the thin Ankh command provider over the same standalone APM command adapter. */
export function createCliProvider(version: string): AnkhRuntimeCommandProvider {
  const commands = [status, plan, apply, verify] as const;

  return {
    id: '@ankhorage/apm',
    category: 'apm',
    version,
    capabilities: commands.map((command) => command.capability),
    commands: commands.map((command) => ({
      path: command.path,
      capability: command.capability,
      summary: command.summary,
    })),
    handlers: commands.map((command) => ({
      path: command.path,
      handler: async (request) => ({
        exitCode: await runAsync([command.path[0], ...request.argv], request.context),
      }),
    })),
  };
}

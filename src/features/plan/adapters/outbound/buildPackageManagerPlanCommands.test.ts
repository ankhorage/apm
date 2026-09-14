import { expect, test } from 'bun:test';

import type { ApmPlanResolutionRequest } from '../../../../types/plan.js';
import type { ApmPackageManagerName } from '../../../../types/status.js';
import { buildPackageManagerPlanCommands } from './buildPackageManagerPlanCommands.js';

test('all direct native resolvers use lock-only planning with lifecycle execution disabled', () => {
  const commands = (['npm', 'pnpm', 'yarn', 'bun'] as const).map((manager) => ({
    manager,
    command: buildPackageManagerPlanCommands(requestFixture(manager, true))[0],
  }));

  expect(commands.map(({ manager, command }) => [manager, command?.args])).toEqual([
    [
      'npm',
      [
        'install',
        '--package-lock-only',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--strict-peer-deps',
      ],
    ],
    ['pnpm', ['install', '--lockfile-only', '--ignore-scripts']],
    ['yarn', ['install', '--mode=update-lockfile']],
    ['bun', ['install', '--lockfile-only', '--ignore-scripts']],
  ]);
});

test('transitive native resolution remains a lock operation instead of adding a root dependency', () => {
  expect(buildPackageManagerPlanCommands(requestFixture('npm', false))).toEqual([
    {
      executable: 'npm',
      args: [
        'update',
        'example-package',
        '--package-lock-only',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--strict-peer-deps',
      ],
    },
  ]);
  expect(buildPackageManagerPlanCommands(requestFixture('yarn', false))).toEqual([
    {
      executable: 'yarn',
      args: ['up', 'example-package@1.2.0', '-R', '--mode=update-lockfile'],
    },
  ]);
});

/*** Build one native resolver request for direct or transitive command-policy tests. */
function requestFixture(manager: ApmPackageManagerName, direct: boolean): ApmPlanResolutionRequest {
  return {
    rootPath: '/project',
    installRootId: '.',
    installRootPath: '/project',
    packagePaths: ['/project'],
    manager,
    targets: [
      {
        installRootId: '.',
        packageId: 'example-package@1.0.0',
        name: 'example-package',
        direct,
        ...(direct
          ? {
              ownerPath: 'package.json',
              kind: 'dependency' as const,
              currentRange: '^1.0.0',
              targetRange: '^1.0.0',
            }
          : {}),
        currentVersion: '1.0.0',
        targetVersion: '1.2.0',
        source: 'exact',
        reason: 'test',
      },
    ],
  };
}

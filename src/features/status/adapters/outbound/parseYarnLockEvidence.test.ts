import { expect, test } from 'bun:test';

import type { ApmManagerInspectionInput } from '../../../../types/status-inventory.js';
import { parseYarnLockEvidence } from './parseYarnLockEvidence.js';

test('keeps Yarn root workspace as importer evidence without materializing it as a package', () => {
  const evidence = parseYarnLockEvidence({
    managerInput: managerInputFixture(),
    lockPath: 'yarn.lock',
    parsed: {
      __metadata: { version: 8 },
      'fixture@workspace:.': {
        version: '0.0.0-use.local',
        resolution: 'fixture@workspace:.',
        dependencies: { dep: 'npm:^1.0.0', local: 'workspace:packages/local' },
      },
      'dep@npm:^1.0.0': {
        version: '1.2.0',
        resolution: 'dep@npm:1.2.0',
      },
      'local@workspace:packages/local': {
        resolution: 'local@workspace:packages/local',
      },
    },
  });

  expect(evidence.lockedPackages.map(({ id }) => id)).toEqual([
    'yarn:dep@npm:^1.0.0',
    'yarn:local@workspace:packages/local',
  ]);
  expect(evidence.lockedPackages.find(({ name }) => name === 'local')).toMatchObject({
    source: 'workspace',
    location: 'packages/local',
  });
  expect([...evidence.directResolutions.values()]).toEqual([
    'yarn:dep@npm:^1.0.0',
    'yarn:local@workspace:packages/local',
  ]);
});

/*** Build one root manifest whose dependencies are owned by Yarn's workspace importer entry. */
function managerInputFixture(): ApmManagerInspectionInput {
  return {
    root: {
      id: '.',
      rootPath: '/project',
      manager: {
        state: 'selected',
        name: 'yarn',
        version: '4.9.2',
        source: 'package-manager-field',
      },
      lockfileCandidates: [
        {
          manager: 'yarn',
          fileName: 'yarn.lock',
          path: '/project/yarn.lock',
        },
      ],
      manifests: [
        {
          packageRoot: '/project',
          manifestPath: '/project/package.json',
          name: 'fixture',
          packageManager: 'yarn@4.9.2',
          dependencies: { dep: '^1.0.0', local: 'workspace:packages/local' },
          devDependencies: {},
          optionalDependencies: {},
          peerDependencies: {},
          optionalPeers: new Set(),
        },
      ],
      diagnostics: [],
    },
  };
}

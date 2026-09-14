import { expect, test } from 'bun:test';

import type { ApmPlanResolutionRequest } from '../../../../types/plan.js';
import { toPlanCommandFailureBlocker } from './toPlanCommandFailureBlocker.js';

const REQUEST: ApmPlanResolutionRequest = {
  rootPath: '/project',
  installRootId: '.',
  installRootPath: '/project',
  packagePaths: ['/project'],
  manager: 'npm',
  targets: [],
};

test('classifies native peer solver rejection without leaking raw stderr', () => {
  const blocker = toPlanCommandFailureBlocker(
    REQUEST,
    { executable: 'npm', args: ['install', '--package-lock-only'] },
    {
      exitCode: 1,
      stdout: '',
      stderr: 'npm ERR! ERESOLVE unable to resolve dependency tree: peer dependency mismatch',
    },
  );

  expect(blocker.code).toBe('plan.peer-conflict');
  expect(blocker.evidence).toEqual(['npm', 'install', '--package-lock-only', 'exit:1']);
  expect(blocker.evidence.join(' ')).not.toContain('ERESOLVE');
});

test('keeps unrelated native command failures generic', () => {
  const blocker = toPlanCommandFailureBlocker(
    REQUEST,
    { executable: 'npm', args: ['install', '--package-lock-only'] },
    { exitCode: 1, stdout: '', stderr: 'network unavailable' },
  );

  expect(blocker.code).toBe('plan.resolution-failed');
});

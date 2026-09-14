import { describe, expect, test } from 'bun:test';

import type { ProjectInspection } from '@ankhorage/project-detector/types';

import { statusAsync } from './statusAsync.js';

const inspection: ProjectInspection = {
  rootPath: '/fixture',
  complete: true,
  detection: {
    traits: new Set(['typescript', 'node']),
    languages: [{ id: 'typescript', score: 10, evidence: ['package.json'], sourceRoots: ['src'] }],
    packageManagers: ['npm'],
    buildTools: [],
    findings: [],
    diagnostics: [],
  },
  packages: [],
  workspaces: [],
  manifests: ['package.json'],
  diagnostics: [{ code: 'fixture', message: 'fixture diagnostic', path: 'package.json' }],
};

describe('statusAsync', () => {
  test('uses an injected inspection port and returns serializable status', async () => {
    const result = await statusAsync(
      { rootPath: '/fixture' },
      {
        inspectProjectAsync: async (rootPath) => {
          expect(rootPath).toBe('/fixture');
          return inspection;
        },
      },
    );

    expect(result.operation).toBe('status');
    expect(result.complete).toBe(true);
    expect(result.project.traits).toEqual(['typescript', 'node']);
    expect(result.project.packageManagers).toEqual(['npm']);
    expect(result.diagnostics).toEqual([
      { code: 'fixture', message: 'fixture diagnostic', path: 'package.json' },
    ]);
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});

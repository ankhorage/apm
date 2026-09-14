import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { resolveNpmExtensionArtifactIdentityAsync } from './resolveNpmExtensionArtifactIdentityAsync.js';

test('resolves exact dist integrity through project npmrc without leaking credentials', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-artifact-'));
  const requests: { readonly url: string; readonly authorization: string | null }[] = [];

  try {
    await writeFile(
      path.join(rootPath, '.npmrc'),
      [
        '@owner:registry=https://registry.example.test/',
        '//registry.example.test/:_authToken=${REGISTRY_TOKEN}',
      ].join('\n'),
      'utf8',
    );
    const result = await resolveNpmExtensionArtifactIdentityAsync(
      {
        rootPath,
        packageName: '@owner/package',
        version: '2.0.0',
        role: 'target',
        descriptorDigest: 'sha256:descriptor',
      },
      {
        env: { REGISTRY_TOKEN: 'secret-token' },
        home: rootPath,
        fetchFn: (input, init) => {
          const headers = new Headers(init?.headers);
          requests.push({
            url: String(input),
            authorization: headers.get('authorization'),
          });
          return Promise.resolve(
            Response.json({
              versions: {
                '2.0.0': { dist: { integrity: 'sha512-target-artifact' } },
              },
            }),
          );
        },
      },
    );

    expect(result).toEqual({
      state: 'resolved',
      artifact: {
        role: 'target',
        packageName: '@owner/package',
        version: '2.0.0',
        integrity: 'sha512-target-artifact',
        descriptorDigest: 'sha256:descriptor',
      },
      evidence: ['@owner/package', '2.0.0', 'sha512-target-artifact'],
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain('registry.example.test');
    expect(requests[0]?.authorization).toBe('Bearer secret-token');
    expect(JSON.stringify(result)).not.toContain('secret-token');
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test('rejects exact versions without immutable dist integrity', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-artifact-missing-'));
  try {
    const result = await resolveNpmExtensionArtifactIdentityAsync(
      {
        rootPath,
        packageName: '@owner/package',
        version: '2.0.0',
        role: 'target',
        descriptorDigest: 'sha256:descriptor',
      },
      {
        home: rootPath,
        fetchFn: () =>
          Promise.resolve(Response.json({ versions: { '2.0.0': { dist: {} } } })),
      },
    );

    expect(result.state).toBe('unavailable');
    expect(result.evidence).toEqual(['@owner/package', '2.0.0']);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

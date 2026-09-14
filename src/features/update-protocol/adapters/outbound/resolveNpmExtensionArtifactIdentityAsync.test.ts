import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import type { ApmExtensionArtifactIdentityRequest } from '../../../../types/extension-artifact.js';
import type { ApmRegistryFetch } from '../../../../types/registry.js';
import { resolveNpmExtensionArtifactIdentityAsync } from './resolveNpmExtensionArtifactIdentityAsync.js';

interface RecordedRequest {
  readonly url: string;
  readonly authorization: string | null;
}

test('resolves exact dist integrity through project npmrc without leaking credentials', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-artifact-'));
  const requests: RecordedRequest[] = [];

  try {
    await writeRegistryConfigAsync(rootPath);
    const result = await resolveNpmExtensionArtifactIdentityAsync(artifactRequest(rootPath), {
      env: { REGISTRY_TOKEN: 'secret-token' },
      home: rootPath,
      fetchFn: createRecordingFetch(requests),
    });

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
    expect(requests).toEqual([
      {
        url: 'https://registry.example.test/%40owner%2Fpackage',
        authorization: 'Bearer secret-token',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret-token');
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test('rejects exact versions without immutable dist integrity', async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'apm-artifact-missing-'));
  try {
    const result = await resolveNpmExtensionArtifactIdentityAsync(artifactRequest(rootPath), {
      home: rootPath,
      fetchFn: () => Promise.resolve(Response.json({ versions: { '2.0.0': { dist: {} } } })),
    });

    expect(result.state).toBe('unavailable');
    expect(result.evidence).toEqual(['@owner/package', '2.0.0']);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

function artifactRequest(rootPath: string): ApmExtensionArtifactIdentityRequest {
  return {
    rootPath,
    packageName: '@owner/package',
    version: '2.0.0',
    role: 'target',
    descriptorDigest: 'sha256:descriptor',
  };
}

async function writeRegistryConfigAsync(rootPath: string): Promise<void> {
  await writeFile(
    path.join(rootPath, '.npmrc'),
    [
      '@owner:registry=https://registry.example.test/',
      '//registry.example.test/:_authToken=${REGISTRY_TOKEN}',
    ].join('\n'),
    'utf8',
  );
}

function createRecordingFetch(requests: RecordedRequest[]): ApmRegistryFetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      url: requestUrl(input),
      authorization: headers.get('authorization'),
    });
    return Promise.resolve(
      Response.json({
        versions: {
          '2.0.0': { dist: { integrity: 'sha512-target-artifact' } },
        },
      }),
    );
  };
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

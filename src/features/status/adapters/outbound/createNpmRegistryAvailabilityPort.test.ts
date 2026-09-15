import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import type { ApmRegistryFetch } from '../../../../types/registry.js';
import { createNpmRegistryAvailabilityPort } from './createNpmRegistryAvailabilityPort.js';

test('uses npmrc registry/auth config and returns latest plus compatible semantic versions', async () => {
  await withRegistryFixture(async (root) => {
    await writeFile(
      path.join(root, '.npmrc'),
      ['registry=https://registry.example/', '//registry.example/:_authToken=${TOKEN}', ''].join(
        '\n',
      ),
    );
    const requests: RequestInit[] = [];
    const fetchFn: ApmRegistryFetch = (_input, init) => {
      requests.push(init ?? {});
      return Promise.resolve(
        new Response(
          JSON.stringify({
            'dist-tags': { latest: '3.0.0' },
            versions: { '1.0.0': {}, '1.5.0': {}, '2.0.0': {}, '3.0.0': {} },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    };
    const port = createNpmRegistryAvailabilityPort({
      fetchFn,
      env: { TOKEN: 'super-secret-token' },
      home: path.join(root, 'empty-home'),
      now: () => 1_000,
    });
    const result = await port.queryAvailabilityAsync({
      rootPath: root,
      mode: 'refresh',
      packages: [
        {
          packageId: 'pkg',
          name: 'pkg',
          role: 'application',
          source: 'registry',
          currentVersion: '1.0.0',
          declaredRange: '^1.0.0',
        },
      ],
    });

    expect(result.complete).toBe(true);
    expect(result.packages[0]?.latestVersion).toBe('3.0.0');
    expect(result.packages[0]?.compatibleVersion).toBe('1.5.0');
    expect(new Headers(requests[0]?.headers).get('authorization')).toBe(
      'Bearer super-secret-token',
    );
    expect(JSON.stringify(result)).not.toContain('super-secret-token');
  });
});

test('offline cache miss makes availability incomplete without making a network request', async () => {
  await withRegistryFixture(async (root) => {
    const calls: string[] = [];
    const fetchFn: ApmRegistryFetch = (input) => {
      calls.push(requestUrl(input));
      return Promise.reject(new Error('network must not be called'));
    };
    const port = createNpmRegistryAvailabilityPort({
      fetchFn,
      home: path.join(root, 'empty-home'),
    });
    const result = await port.queryAvailabilityAsync({
      rootPath: root,
      mode: 'offline',
      packages: [{ packageId: 'pkg', name: 'pkg', role: 'application', source: 'registry' }],
    });

    expect(calls).toEqual([]);
    expect(result.complete).toBe(false);
    expect(result.packages[0]?.state).toBe('unknown');
    expect(result.diagnostics[0]?.code).toBe('status.registry.availability-unknown');
  });
});

test('auth or network failures stay redacted and incomplete', async () => {
  await withRegistryFixture(async (root) => {
    await writeFile(path.join(root, '.npmrc'), 'registry=https://registry.example/\n');
    const fetchFn: ApmRegistryFetch = () =>
      Promise.reject(
        new Error('request to https://user:private-password@registry.example/pkg failed'),
      );
    const port = createNpmRegistryAvailabilityPort({
      fetchFn,
      home: path.join(root, 'empty-home'),
    });
    const result = await port.queryAvailabilityAsync({
      rootPath: root,
      mode: 'refresh',
      packages: [{ packageId: 'pkg', name: 'pkg', role: 'application', source: 'registry' }],
    });

    expect(result.complete).toBe(false);
    expect(JSON.stringify(result)).not.toContain('private-password');
    expect(result.packages[0]?.state).toBe('unknown');
  });
});

test('workspace and file packages are complete without registry requests', async () => {
  await withRegistryFixture(async (root) => {
    const calls: string[] = [];
    const fetchFn: ApmRegistryFetch = (input) => {
      calls.push(requestUrl(input));
      return Promise.reject(new Error('network must not be called'));
    };
    const port = createNpmRegistryAvailabilityPort({
      fetchFn,
      home: path.join(root, 'empty-home'),
    });
    const result = await port.queryAvailabilityAsync({
      rootPath: root,
      mode: 'refresh',
      packages: [
        {
          packageId: 'workspace',
          name: 'workspace-pkg',
          role: 'application',
          source: 'workspace',
        },
        { packageId: 'file', name: 'file-pkg', role: 'application', source: 'file' },
      ],
    });

    expect(calls).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.packages.map((item) => item.state)).toEqual(['not-applicable', 'not-applicable']);
  });
});

/*** Render the registry request target without falling back to Object stringification. */
function requestUrl(input: Parameters<ApmRegistryFetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/*** Run one isolated registry-config fixture and clean it after each behavior assertion. */
async function withRegistryFixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'apm-registry-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('inspects more than 64 names with bounded concurrency and stable instance ordering', async () => {
  await withRegistryFixture(async (root) => {
    const activity = { current: 0, peak: 0, calls: 0 };
    const port = createNpmRegistryAvailabilityPort({
      home: path.join(root, 'empty-home'),
      concurrency: 4,
      fetchFn: async () => {
        activity.current += 1;
        activity.calls += 1;
        activity.peak = Math.max(activity.peak, activity.current);
        await Promise.resolve();
        activity.current -= 1;
        return new Response(JSON.stringify({ versions: { '1.0.0': {} } }));
      },
    });
    const packages = Array.from({ length: 137 }, (_, index) => ({
      packageId: `instance:${index}`,
      name: `pkg-${index}`,
      role: 'application' as const,
    }));
    const result = await port.queryAvailabilityAsync({ rootPath: root, mode: 'refresh', packages });
    expect(result.complete).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(activity.calls).toBe(packages.length);
    expect(activity.peak).toBe(4);
    expect(result.packages.map(({ packageId }) => packageId)).toEqual(
      packages.map(({ packageId }) => packageId),
    );
  });
});

test('deduplicates one registry name while retaining different compatible versions per instance', async () => {
  await withRegistryFixture(async (root) => {
    const calls: string[] = [];
    const port = createNpmRegistryAvailabilityPort({
      home: path.join(root, 'empty-home'),
      maxRequests: 1,
      fetchFn: (url) => {
        calls.push(requestUrl(url));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              'dist-tags': { latest: '3.0.0' },
              versions: { '1.2.0': {}, '2.1.0': {}, '3.0.0': {} },
            }),
          ),
        );
      },
    });
    const packages = ['^1.0.0', '^2.0.0'].map((declaredRange, index) => ({
      name: 'dep',
      packageId: `variant:${index}`,
      role: 'application' as const,
      declaredRange,
    }));
    const result = await port.queryAvailabilityAsync({ rootPath: root, mode: 'refresh', packages });
    expect(result.complete).toBe(true);
    expect(calls.length).toBe(1);
    expect(result.packages.map(({ compatibleVersion }) => compatibleVersion)).toEqual([
      '1.2.0',
      '2.1.0',
    ]);
    const offline = await port.queryAvailabilityAsync({
      rootPath: root,
      mode: 'offline',
      packages,
    });
    expect(offline.complete).toBe(true);
    expect(calls.length).toBe(1);
  });
});

test('deduplicates failed lookups and leaves explicit budget overflow unknown', async () => {
  await withRegistryFixture(async (root) => {
    const calls: string[] = [];
    const port = createNpmRegistryAvailabilityPort({
      home: path.join(root, 'empty-home'),
      maxRequests: 1,
      fetchFn: (url) => {
        calls.push(requestUrl(url));
        return Promise.resolve(new Response('', { status: 503 }));
      },
    });
    const packages = ['dep', 'dep', 'another'].map((name, index) => ({
      name,
      packageId: `${index}`,
      role: 'application' as const,
    }));
    const result = await port.queryAvailabilityAsync({ rootPath: root, mode: 'refresh', packages });
    expect(result.complete).toBe(false);
    expect(calls.length).toBe(1);
    expect(result.packages.map(({ state }) => state)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(result.packages[0]?.reason).toBe(result.packages[1]?.reason);
    expect(result.diagnostics.some(({ code }) => code === 'status.registry.request-limit')).toBe(
      true,
    );
  });
});

test('rejects invalid host concurrency and budget settings before doing network work', () => {
  for (const concurrency of [0, -1, 1.5, 65, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => createNpmRegistryAvailabilityPort({ concurrency })).toThrow(RangeError);
  }
  for (const maxRequests of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => createNpmRegistryAvailabilityPort({ maxRequests })).toThrow(RangeError);
  }
});

test('serves fresh cache outside the network budget and rejects stale offline evidence', async () => {
  await withRegistryFixture(async (root) => {
    const clock = { now: 1000 };
    const calls: string[] = [];
    const port = createNpmRegistryAvailabilityPort({
      home: path.join(root, 'empty-home'),
      maxRequests: 1,
      cacheTtlMs: 100,
      now: () => clock.now,
      fetchFn: (url) => {
        calls.push(requestUrl(url));
        return Promise.resolve(new Response(JSON.stringify({ versions: { '1.0.0': {} } })));
      },
    });
    const cached = { name: 'cached', packageId: 'cached', role: 'application' as const };
    await port.queryAvailabilityAsync({ rootPath: root, mode: 'refresh', packages: [cached] });
    const packages = [{ ...cached, name: 'new', packageId: 'new' }, cached];
    const warm = await port.queryAvailabilityAsync({ rootPath: root, mode: 'refresh', packages });
    expect(warm.complete).toBe(true);
    expect(warm.diagnostics).toEqual([]);
    expect(calls.length).toBe(2);
    clock.now = 1200;
    const stale = await port.queryAvailabilityAsync({ rootPath: root, mode: 'offline', packages });
    expect(stale.complete).toBe(false);
    expect(calls.length).toBe(2);
    expect(stale.diagnostics.some(({ code }) => code === 'status.registry.request-limit')).toBe(
      false,
    );
  });
});

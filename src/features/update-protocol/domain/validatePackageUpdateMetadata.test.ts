import { expect, test } from 'bun:test';

import { validatePackageUpdateMetadata } from '@ankhorage/apm';

test('round-trips canonical package update discovery metadata through the public API', () => {
  const result = validatePackageUpdateMetadata({
    protocolVersion: 1,
    descriptor: './apm/update.json',
  });

  expect(result.valid).toBe(true);
  expect(result.metadata).toEqual({ protocolVersion: 1, descriptor: './apm/update.json' });
  expect(result.blockers).toEqual([]);
});

test('blocks unsupported discovery protocol versions before descriptor loading', () => {
  const result = validatePackageUpdateMetadata({
    protocolVersion: 2,
    descriptor: './apm/update.json',
  });

  expect(result.valid).toBe(false);
  expect(result.metadata).toBeUndefined();
  expect(result.blockers.map((blocker) => blocker.code)).toContain('protocol.unsupported-version');
});

test('blocks descriptor paths that escape the immutable package artifact', () => {
  const result = validatePackageUpdateMetadata({
    protocolVersion: 1,
    descriptor: './../outside.json',
  });

  expect(result.valid).toBe(false);
  expect(result.blockers.map((blocker) => blocker.code)).toContain(
    'protocol.invalid-descriptor-path',
  );
});

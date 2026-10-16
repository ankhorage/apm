import { readFile } from 'node:fs/promises';

import { areCapabilityCatalogsEqual, isCapabilityCatalog } from '@ankhorage/capability';
import type { Capability } from '@ankhorage/contracts/capability';
import { describe, expect, test } from 'bun:test';

import { CAPABILITIES } from './index.js';

describe('CAPABILITIES', () => {
  test('synchronizes the published package metadata with the canonical catalog', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as PackageManifest;

    expect(manifest.exports['./capabilities']).toEqual({
      types: './dist/capabilities/index.d.ts',
      import: './dist/capabilities/index.js',
    });
    expect(isCapabilityCatalog(manifest.ankh.capabilities)).toBe(true);
    expect(areCapabilityCatalogsEqual(CAPABILITIES, manifest.ankh.capabilities)).toBe(true);
  });
});

interface PackageManifest {
  readonly ankh: {
    readonly capabilities: readonly Capability[];
  };
  readonly exports: Readonly<Record<string, unknown>>;
}

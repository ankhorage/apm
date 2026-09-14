import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isMissingPathError } from '@ankhorage/utility/node/fs';

import type { ApmRegistryConfig } from '../../../../types/status-registry.js';

/*** Read npm-compatible user/project registry configuration without returning credential values. */
export async function readRegistryConfigAsync(input: {
  readonly rootPath: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly home: string;
}): Promise<ApmRegistryConfig> {
  const userValues = await readNpmrcAsync(path.join(input.home, '.npmrc'), input.env);
  const projectValues = await readNpmrcAsync(path.join(input.rootPath, '.npmrc'), input.env);
  const values = new Map([...userValues, ...projectValues]);
  const envRegistry = input.env.npm_config_registry ?? input.env.NPM_CONFIG_REGISTRY;
  const defaultRegistry = ensureTrailingSlash(
    envRegistry ?? values.get('registry') ?? 'https://registry.npmjs.org/',
  );
  const scopedRegistries = new Map(
    [...values.entries()].flatMap(([key, value]) =>
      /^@[^:]+:registry$/u.test(key)
        ? [[key.slice(0, key.indexOf(':')), ensureTrailingSlash(value)] as const]
        : [],
    ),
  );
  return { defaultRegistry, scopedRegistries, values };
}

/*** Parse npmrc key/value lines and expand environment placeholders only at the adapter edge. */
async function readNpmrcAsync(
  filePath: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<ReadonlyMap<string, string>> {
  try {
    const text = await readFile(filePath, 'utf8');
    return new Map(
      text
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith(';'))
        .flatMap((line) => parseNpmrcLine(line, env)),
    );
  } catch (error) {
    if (isMissingPathError(error)) return new Map();
    throw error;
  }
}

/*** Parse one npmrc assignment while keeping expansion local to the secret-bearing edge. */
function parseNpmrcLine(
  line: string,
  env: Readonly<Record<string, string | undefined>>,
): readonly (readonly [string, string])[] {
  const separator = line.indexOf('=');
  if (separator < 0) return [];
  const key = line.slice(0, separator).trim();
  const raw = line.slice(separator + 1).trim();
  const value = raw.replace(/\$\{([^}]+)\}/gu, (_match, name: string) => env[name] ?? '');
  return [[key, value]];
}

/*** Normalize registry base URLs before package URL resolution. */
function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

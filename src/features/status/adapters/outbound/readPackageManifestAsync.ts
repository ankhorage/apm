import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isRecord } from '@ankhorage/utility/object';

import type { ApmParsedPackageManifest } from '../../../types/status-inventory.js';

/*** Read only dependency declarations needed for APM inventory from one package manifest. */
export async function readPackageManifestAsync(
  rootPath: string,
  manifestPath: string,
): Promise<ApmParsedPackageManifest> {
  const absolutePath = path.resolve(rootPath, manifestPath);
  const parsed = JSON.parse(await readFile(absolutePath, 'utf8')) as unknown;
  if (!isRecord(parsed)) throw new Error(`Package manifest is not an object: ${manifestPath}`);
  const packageRoot = path.dirname(absolutePath);
  const peerDependenciesMeta = isRecord(parsed.peerDependenciesMeta)
    ? parsed.peerDependenciesMeta
    : {};
  return {
    packageRoot,
    manifestPath,
    ...(typeof parsed.name === 'string' ? { name: parsed.name } : {}),
    ...(typeof parsed.packageManager === 'string' ? { packageManager: parsed.packageManager } : {}),
    dependencies: readStringMap(parsed.dependencies),
    devDependencies: readStringMap(parsed.devDependencies),
    optionalDependencies: readStringMap(parsed.optionalDependencies),
    peerDependencies: readStringMap(parsed.peerDependencies),
    optionalPeers: new Set(
      Object.entries(peerDependenciesMeta).flatMap(([name, metadata]) =>
        isRecord(metadata) && metadata.optional === true ? [name] : [],
      ),
    ),
  };
}

/*** Keep only string-valued dependency declarations from an untrusted manifest object. */
function readStringMap(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

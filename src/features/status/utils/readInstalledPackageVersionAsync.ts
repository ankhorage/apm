import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isMissingPathError } from '@ankhorage/utility/node/fs';
import { isRecord } from '@ankhorage/utility/object';

import type { ApmInstalledPackageEvidence } from '../../../types/status.js';

/*** Read one installed package manifest without loading or executing the package. */
export async function readInstalledPackageVersionAsync(input: {
  readonly packageId: string;
  readonly packagePath: string;
  readonly source: ApmInstalledPackageEvidence['source'];
  readonly serializedLocation: string;
}): Promise<ApmInstalledPackageEvidence> {
  try {
    const parsed = JSON.parse(await readFile(path.join(input.packagePath, 'package.json'), 'utf8')) as unknown;
    if (!isRecord(parsed) || typeof parsed.version !== 'string') {
      return {
        packageId: input.packageId,
        state: 'unknown',
        source: input.source,
        location: input.serializedLocation,
        reason: 'Installed package.json does not expose a string version.',
      };
    }
    return {
      packageId: input.packageId,
      state: 'present',
      source: input.source,
      version: parsed.version,
      location: input.serializedLocation,
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        packageId: input.packageId,
        state: 'absent',
        source: input.source,
        location: input.serializedLocation,
        reason: 'Installed package directory or package.json is absent.',
      };
    }
    return {
      packageId: input.packageId,
      state: 'unknown',
      source: input.source,
      location: input.serializedLocation,
      reason: error instanceof Error ? error.message : 'Installed package evidence could not be read.',
    };
  }
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isMissingPathError } from '@ankhorage/utility/node/fs';
import { isRecord } from '@ankhorage/utility/object';

import type { ApmInstalledPackageEvidence } from '../../../types/status.js';

/*** Read one installed package manifest without loading or executing the package. */
export async function readInstalledPackageVersionAsync(
  input: InstalledPackageInput,
): Promise<ApmInstalledPackageEvidence> {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(input.packagePath, 'package.json'), 'utf8'),
    ) as unknown;
    return toInstalledPackageEvidence(input, parsed);
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
      reason:
        error instanceof Error ? error.message : 'Installed package evidence could not be read.',
    };
  }
}

interface InstalledPackageInput {
  readonly packageId: string;
  readonly expectedName?: string;
  readonly packagePath: string;
  readonly source: ApmInstalledPackageEvidence['source'];
  readonly serializedLocation: string;
}

/*** Validate the data-only installed manifest before recording identity and version evidence. */
function toInstalledPackageEvidence(
  input: InstalledPackageInput,
  parsed: unknown,
): ApmInstalledPackageEvidence {
  if (
    !isRecord(parsed) ||
    typeof parsed.version !== 'string' ||
    (input.expectedName !== undefined && parsed.name !== input.expectedName)
  ) {
    return {
      packageId: input.packageId,
      state: 'unknown',
      source: input.source,
      location: input.serializedLocation,
      reason:
        'Installed package.json does not expose a string version or the expected package identity.',
    };
  }
  return {
    packageId: input.packageId,
    state: 'present',
    source: input.source,
    version: parsed.version,
    location: input.serializedLocation,
  };
}

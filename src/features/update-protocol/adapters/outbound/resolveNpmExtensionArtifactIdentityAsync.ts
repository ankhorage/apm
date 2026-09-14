import { homedir } from 'node:os';

import { isRecord } from '@ankhorage/utility/object';

import type {
  ApmExtensionArtifactIdentityRequest,
  ApmExtensionArtifactIdentityResolution,
} from '../../../../types/extension-artifact.js';
import type { ApmRegistryFetch, ApmRegistryRequestOptions } from '../../../../types/registry.js';
import { createRegistryPackageRequest } from '../../../../utils/createRegistryPackageRequest.js';
import { readRegistryConfigAsync } from '../../../../utils/readRegistryConfigAsync.js';

/*** Resolve one exact npm-compatible package artifact to immutable protocol identity using registry dist integrity. */
export async function resolveNpmExtensionArtifactIdentityAsync(
  input: ApmExtensionArtifactIdentityRequest,
  options: ApmRegistryRequestOptions = {},
): Promise<ApmExtensionArtifactIdentityResolution> {
  const fetchFn: ApmRegistryFetch = options.fetchFn ?? ((request, init) => fetch(request, init));
  const config = await readRegistryConfigAsync({
    rootPath: input.rootPath,
    env: options.env ?? process.env,
    home: options.home ?? homedir(),
  });
  const { url, headers } = createRegistryPackageRequest(input.packageName, config);
  try {
    const response = await fetchFn(url, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return unavailable(input, `Registry request failed with HTTP ${response.status}.`);
    }
    const metadata = exactVersionMetadata(await response.json(), input.version);
    const integrity = metadata === undefined ? undefined : readDistIntegrity(metadata);
    if (integrity === undefined) {
      return unavailable(
        input,
        'Exact registry package metadata did not provide immutable dist.integrity evidence.',
      );
    }
    return {
      state: 'resolved',
      artifact: {
        role: input.role,
        packageName: input.packageName,
        version: input.version,
        integrity,
        descriptorDigest: input.descriptorDigest,
      },
      evidence: [input.packageName, input.version, integrity],
    };
  } catch {
    return unavailable(input, 'Registry request failed before exact artifact identity was resolved.');
  }
}

/*** Find exact version metadata without dynamic object indexing. */
function exactVersionMetadata(value: unknown, version: string): Readonly<Record<string, unknown>> | undefined {
  if (!isRecord(value) || !isRecord(value.versions)) return undefined;
  const match = Object.entries(value.versions).find(([candidate]) => candidate === version);
  if (match === undefined) return undefined;
  const [, metadata] = match;
  return isRecord(metadata) ? metadata : undefined;
}

/*** Read immutable npm dist integrity from one exact version metadata record. */
function readDistIntegrity(metadata: Readonly<Record<string, unknown>>): string | undefined {
  const dist = metadata.dist;
  return isRecord(dist) && typeof dist.integrity === 'string' && dist.integrity !== ''
    ? dist.integrity
    : undefined;
}

/*** Return bounded non-secret evidence when exact registry artifact identity cannot be proven. */
function unavailable(
  input: ApmExtensionArtifactIdentityRequest,
  reason: string,
): ApmExtensionArtifactIdentityResolution {
  return {
    state: 'unavailable',
    evidence: [input.packageName, input.version],
    reason,
  };
}

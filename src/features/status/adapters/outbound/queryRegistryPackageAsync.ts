import { isRecord } from '@ankhorage/utility/object';
import { maxSatisfying, rsort, valid, validRange } from 'semver';

import type { ApmRegistryFetch } from '../../../../types/registry.js';
import type {
  ApmRegistryCacheEntry,
  ApmRegistryConfig,
  ApmRegistryMetadata,
} from '../../../../types/status-registry.js';
import type {
  ApmAvailabilityRequest,
  ApmPackageAvailabilityEvidence,
} from '../../../../types/status.js';

/*** Query one package with bounded cache semantics and no credential leakage into evidence. */
export async function queryRegistryPackageAsync(input: QueryRegistryPackageInput): Promise<ApmPackageAvailabilityEvidence> {
  const registry = registryForPackage(input.request.name, input.config);
  const cacheKey = `${registry}\u0000${input.request.name}`;
  const cached = input.cache.get(cacheKey);
  const currentTime = input.now();
  const fresh = cached !== undefined && currentTime - cached.fetchedAt <= input.cacheTtlMs;
  if (cached !== undefined && fresh) return toAvailability(input.request, cached);
  if (input.mode === 'offline') {
    return unknownAvailability(
      input.request,
      cached === undefined
        ? 'Offline mode has no cached registry evidence.'
        : 'Offline cached registry evidence is stale.',
    );
  }
  return fetchRegistryPackageAsync(input, registry, cacheKey, currentTime);
}

interface QueryRegistryPackageInput {
  readonly request: ApmAvailabilityRequest;
  readonly mode: 'refresh' | 'offline';
  readonly config: ApmRegistryConfig;
  readonly fetchFn: ApmRegistryFetch;
  readonly now: () => number;
  readonly cacheTtlMs: number;
  readonly cache: Map<string, ApmRegistryCacheEntry>;
}

/*** Fetch fresh npm-compatible package metadata and cache only parsed semantic evidence. */
async function fetchRegistryPackageAsync(
  input: QueryRegistryPackageInput,
  registry: string,
  cacheKey: string,
  currentTime: number,
): Promise<ApmPackageAvailabilityEvidence> {
  try {
    const url = new URL(encodeURIComponent(input.request.name), ensureTrailingSlash(registry));
    const response = await input.fetchFn(url, {
      headers: buildAuthHeaders(url, input.config),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return unknownAvailability(input.request, `Registry request failed with HTTP ${response.status}.`);
    }
    const metadata = parseRegistryMetadata(await response.json());
    if (metadata.versions.length === 0) {
      return unknownAvailability(input.request, 'Registry metadata contained no semantic versions.');
    }
    const entry: ApmRegistryCacheEntry = {
      fetchedAt: currentTime,
      checkedAt: new Date(currentTime).toISOString(),
      metadata,
      registry,
    };
    input.cache.set(cacheKey, entry);
    return toAvailability(input.request, entry);
  } catch (error) {
    return unknownAvailability(
      input.request,
      error instanceof Error
        ? `Registry request failed: ${redactUrlCredentials(error.message)}`
        : 'Registry request failed.',
    );
  }
}

/*** Parse registry metadata into semantic versions only, ignoring executable package fields. */
function parseRegistryMetadata(value: unknown): ApmRegistryMetadata {
  if (!isRecord(value)) return { versions: [] };
  const versions = isRecord(value.versions)
    ? rsort(Object.keys(value.versions).filter((version) => valid(version) !== null))
    : [];
  const distTags = isRecord(value['dist-tags']) ? value['dist-tags'] : {};
  const latestVersion = typeof distTags.latest === 'string' && valid(distTags.latest) !== null
    ? distTags.latest
    : versions[0];
  return { versions, ...(latestVersion === undefined ? {} : { latestVersion }) };
}

/*** Compute latest and constraint-compatible candidates without treating URLs/tags as semver ranges. */
function toAvailability(
  request: ApmAvailabilityRequest,
  entry: ApmRegistryCacheEntry,
): ApmPackageAvailabilityEvidence {
  const range = request.declaredRange === undefined ? undefined : normalizeRange(request.declaredRange);
  const compatibleVersion = range === undefined
    ? entry.metadata.latestVersion
    : validRange(range) === null
      ? undefined
      : maxSatisfying(entry.metadata.versions, range) ?? undefined;
  return {
    packageId: request.packageId,
    name: request.name,
    state: 'known',
    registry: entry.registry,
    checkedAt: entry.checkedAt,
    ...(entry.metadata.latestVersion === undefined ? {} : { latestVersion: entry.metadata.latestVersion }),
    ...(compatibleVersion === undefined ? {} : { compatibleVersion }),
  };
}

/*** Normalize npm protocol aliases while leaving unsupported declarations unmatched. */
function normalizeRange(range: string): string {
  return range.startsWith('npm:') ? range.slice('npm:'.length) : range;
}

/*** Select a scoped registry before the project default registry. */
function registryForPackage(name: string, config: ApmRegistryConfig): string {
  const slash = name.indexOf('/');
  const scope = name.startsWith('@') && slash > 0 ? name.slice(0, slash) : undefined;
  return (scope === undefined ? undefined : config.scopedRegistries.get(scope)) ?? config.defaultRegistry;
}

/*** Build Authorization headers from npmrc auth entries while keeping values inside the HTTP edge. */
function buildAuthHeaders(url: URL, config: ApmRegistryConfig): Headers {
  const headers = new Headers({ accept: 'application/vnd.npm.install-v1+json, application/json' });
  const basePath = url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
  const authPrefix = `//${url.host}${basePath}`;
  const hostPrefix = `//${url.host}/`;
  const token = config.values.get(`${authPrefix}:_authToken`) ?? config.values.get(`${hostPrefix}:_authToken`);
  const basic = config.values.get(`${authPrefix}:_auth`) ?? config.values.get(`${hostPrefix}:_auth`);
  if (token !== undefined && token !== '') headers.set('authorization', `Bearer ${token}`);
  else if (basic !== undefined && basic !== '') headers.set('authorization', `Basic ${basic}`);
  return headers;
}

/*** Return explicit unknown package availability without registry credentials or raw headers. */
function unknownAvailability(
  request: ApmAvailabilityRequest,
  reason: string,
): ApmPackageAvailabilityEvidence {
  return { packageId: request.packageId, name: request.name, state: 'unknown', reason };
}

/*** Normalize registry base URLs before package URL resolution. */
function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

/*** Redact embedded URL credentials in network error text without a backtracking expression. */
function redactUrlCredentials(value: string): string {
  const schemeEnd = value.indexOf('://');
  if (schemeEnd < 0) return value;
  const credentialsStart = schemeEnd + 3;
  const at = value.indexOf('@', credentialsStart);
  if (at < 0) return value;
  const credentials = value.slice(credentialsStart, at);
  if (!credentials.includes(':')) return value;
  return `${value.slice(0, credentialsStart)}***:***${value.slice(at)}`;
}

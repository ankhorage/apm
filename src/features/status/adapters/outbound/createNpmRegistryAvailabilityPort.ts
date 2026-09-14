import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isMissingPathError } from '@ankhorage/utility/node/fs';
import { isRecord } from '@ankhorage/utility/object';
import { maxSatisfying, rsort, valid } from 'semver';

import type {
  ApmAvailabilityEvidence,
  ApmAvailabilityRequest,
  ApmPackageAvailabilityEvidence,
  ApmStatusAvailabilityPort,
  ApmStatusDiagnostic,
} from '../../../types/status.js';

/*** Create a bounded npm-compatible registry adapter with redacted config and process-local TTL cache. */
export function createNpmRegistryAvailabilityPort(
  options: CreateRegistryPortOptions = {},
): ApmStatusAvailabilityPort {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? (() => Date.now());
  const maxRequests = options.maxRequests ?? 64;
  const cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
  const cache = new Map<string, RegistryCacheEntry>();
  return {
    queryAvailabilityAsync: async (input) => {
      const config = await readRegistryConfigAsync(input.rootPath, options.env ?? process.env, options.home ?? homedir());
      const allowed = input.packages.slice(0, maxRequests);
      const overflow = input.packages.slice(maxRequests);
      const packages = await Promise.all(
        allowed.map((request) =>
          queryPackageAsync({ request, mode: input.mode, config, fetchFn, now, cacheTtlMs, cache }),
        ),
      );
      const overflowEvidence = overflow.map((request) => unknownAvailability(
        request,
        `Registry request limit ${maxRequests} was reached.`,
      ));
      const allPackages = [...packages, ...overflowEvidence];
      const diagnostics = [
        ...allPackages.flatMap((item) => availabilityDiagnostic(item)),
        ...(overflow.length === 0
          ? []
          : [
              {
                code: 'status.registry.request-limit',
                severity: 'warning' as const,
                scope: { kind: 'registry' as const },
                evidence: [`requested ${input.packages.length}`, `limit ${maxRequests}`],
                reason: 'Registry availability inspection is bounded and did not query every package.',
                nextAction: 'Reduce the inspected graph or raise the explicit host request budget.',
              },
            ]),
      ];
      return {
        complete: allPackages.every((item) => item.state === 'known'),
        packages: allPackages,
        diagnostics,
      } satisfies ApmAvailabilityEvidence;
    },
  };
}

interface CreateRegistryPortOptions {
  readonly fetchFn?: typeof fetch;
  readonly now?: () => number;
  readonly maxRequests?: number;
  readonly cacheTtlMs?: number;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly home?: string;
}

interface RegistryConfig {
  readonly defaultRegistry: string;
  readonly scopedRegistries: ReadonlyMap<string, string>;
  readonly values: ReadonlyMap<string, string>;
}

interface RegistryCacheEntry {
  readonly fetchedAt: number;
  readonly checkedAt: string;
  readonly metadata: RegistryMetadata;
  readonly registry: string;
}

interface RegistryMetadata {
  readonly latestVersion?: string;
  readonly versions: readonly string[];
}

interface QueryPackageInput {
  readonly request: ApmAvailabilityRequest;
  readonly mode: 'refresh' | 'offline';
  readonly config: RegistryConfig;
  readonly fetchFn: typeof fetch;
  readonly now: () => number;
  readonly cacheTtlMs: number;
  readonly cache: Map<string, RegistryCacheEntry>;
}

/*** Query one package through configured registry/auth data while keeping secrets outside evidence. */
async function queryPackageAsync(input: QueryPackageInput): Promise<ApmPackageAvailabilityEvidence> {
  const registry = registryForPackage(input.request.name, input.config);
  const cacheKey = `${registry}\u0000${input.request.name}`;
  const cached = input.cache.get(cacheKey);
  const currentTime = input.now();
  if (cached !== undefined && currentTime - cached.fetchedAt <= input.cacheTtlMs) {
    return toAvailability(input.request, cached.metadata, cached.registry, cached.checkedAt);
  }
  if (input.mode === 'offline') {
    return cached === undefined
      ? unknownAvailability(input.request, 'Offline mode has no cached registry evidence.')
      : toAvailability(input.request, cached.metadata, cached.registry, cached.checkedAt);
  }
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
    const checkedAt = new Date(currentTime).toISOString();
    input.cache.set(cacheKey, { fetchedAt: currentTime, checkedAt, metadata, registry });
    return toAvailability(input.request, metadata, registry, checkedAt);
  } catch (error) {
    return unknownAvailability(
      input.request,
      error instanceof Error ? `Registry request failed: ${redactUrlCredentials(error.message)}` : 'Registry request failed.',
    );
  }
}

/*** Parse registry metadata into semantic versions only, ignoring executable package fields. */
function parseRegistryMetadata(value: unknown): RegistryMetadata {
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

/*** Compute latest and constraint-compatible candidates without treating tags/URLs as semver ranges. */
function toAvailability(
  request: ApmAvailabilityRequest,
  metadata: RegistryMetadata,
  registry: string,
  checkedAt: string,
): ApmPackageAvailabilityEvidence {
  const compatibleVersion = request.declaredRange === undefined
    ? metadata.latestVersion
    : maxSatisfying(metadata.versions, normalizeRange(request.declaredRange)) ?? undefined;
  return {
    packageId: request.packageId,
    name: request.name,
    state: 'known',
    registry,
    checkedAt,
    ...(metadata.latestVersion === undefined ? {} : { latestVersion: metadata.latestVersion }),
    ...(compatibleVersion === undefined ? {} : { compatibleVersion }),
  };
}

/*** Normalize npm protocol aliases while leaving unsupported non-semver declarations unmatched. */
function normalizeRange(range: string): string {
  return range.startsWith('npm:') ? range.slice('npm:'.length) : range;
}

/*** Return explicit unknown package availability without registry credentials or raw request headers. */
function unknownAvailability(
  request: ApmAvailabilityRequest,
  reason: string,
): ApmPackageAvailabilityEvidence {
  return { packageId: request.packageId, name: request.name, state: 'unknown', reason };
}

/*** Turn unknown availability into a stable, actionable diagnostic. */
function availabilityDiagnostic(item: ApmPackageAvailabilityEvidence): readonly ApmStatusDiagnostic[] {
  if (item.state === 'known') return [];
  return [
    {
      code: 'status.registry.availability-unknown',
      severity: 'warning',
      scope: { kind: 'registry', id: item.packageId },
      evidence: [item.name],
      reason: item.reason ?? 'Package availability is unknown.',
      nextAction: 'Restore registry/auth access or use fresh cached evidence.',
    },
  ];
}

/*** Read npm-compatible user and project config with environment interpolation at the HTTP edge. */
async function readRegistryConfigAsync(
  rootPath: string,
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): Promise<RegistryConfig> {
  const userValues = await readNpmrcAsync(path.join(home, '.npmrc'), env);
  const projectValues = await readNpmrcAsync(path.join(rootPath, '.npmrc'), env);
  const values = new Map([...userValues, ...projectValues]);
  const envRegistry = env.npm_config_registry ?? env.NPM_CONFIG_REGISTRY;
  const defaultRegistry = ensureTrailingSlash(envRegistry ?? values.get('registry') ?? 'https://registry.npmjs.org/');
  const scopedRegistries = new Map(
    [...values.entries()].flatMap(([key, value]) =>
      /^@[^:]+:registry$/u.test(key) ? [[key.slice(0, key.indexOf(':')), ensureTrailingSlash(value)] as const] : [],
    ),
  );
  return { defaultRegistry, scopedRegistries, values };
}

/*** Parse simple npmrc key/value lines and expand environment placeholders without exposing values. */
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
        .flatMap((line) => {
          const separator = line.indexOf('=');
          if (separator < 0) return [];
          const key = line.slice(0, separator).trim();
          const raw = line.slice(separator + 1).trim();
          return [[key, raw.replace(/\$\{([^}]+)\}/gu, (_match, name: string) => env[name] ?? '')] as const];
        }),
    );
  } catch (error) {
    if (isMissingPathError(error)) return new Map();
    throw error;
  }
}

/*** Select a scoped registry before the project default registry. */
function registryForPackage(name: string, config: RegistryConfig): string {
  const scope = name.startsWith('@') ? name.slice(0, name.indexOf('/')) : undefined;
  return (scope === undefined ? undefined : config.scopedRegistries.get(scope)) ?? config.defaultRegistry;
}

/*** Build Authorization headers from npmrc auth entries without returning their values in status. */
function buildAuthHeaders(url: URL, config: RegistryConfig): Headers {
  const headers = new Headers({ accept: 'application/vnd.npm.install-v1+json, application/json' });
  const authPrefix = `//${url.host}${url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1)}`;
  const hostPrefix = `//${url.host}/`;
  const token = config.values.get(`${authPrefix}:_authToken`) ?? config.values.get(`${hostPrefix}:_authToken`);
  const basic = config.values.get(`${authPrefix}:_auth`) ?? config.values.get(`${hostPrefix}:_auth`);
  if (token !== undefined && token !== '') headers.set('authorization', `Bearer ${token}`);
  else if (basic !== undefined && basic !== '') headers.set('authorization', `Basic ${basic}`);
  return headers;
}

/*** Normalize registry base URLs before URL resolution. */
function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

/*** Remove embedded URL credentials from network error strings before they become report evidence. */
function redactUrlCredentials(value: string): string {
  return value.replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gu, 'https://***:***@');
}

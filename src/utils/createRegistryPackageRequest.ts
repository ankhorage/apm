import type { ApmRegistryConfig } from '../types/status-registry.js';

/*** Build one npm-compatible package metadata request using shared scoped-registry and credential rules. */
export function createRegistryPackageRequest(
  packageName: string,
  config: ApmRegistryConfig,
): { readonly registry: string; readonly url: URL; readonly headers: Headers } {
  const registry = ensureTrailingSlash(registryForPackage(packageName, config));
  const url = new URL(encodeURIComponent(packageName), registry);
  return { registry, url, headers: buildAuthHeaders(url, config) };
}

/*** Select a scoped registry before the project default registry. */
function registryForPackage(name: string, config: ApmRegistryConfig): string {
  const slash = name.indexOf('/');
  const scope = name.startsWith('@') && slash > 0 ? name.slice(0, slash) : undefined;
  return (
    (scope === undefined ? undefined : config.scopedRegistries.get(scope)) ?? config.defaultRegistry
  );
}

/*** Build Authorization headers from npmrc auth entries while keeping values inside the HTTP edge. */
function buildAuthHeaders(url: URL, config: ApmRegistryConfig): Headers {
  const headers = new Headers({ accept: 'application/vnd.npm.install-v1+json, application/json' });
  const basePath = url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
  const authPrefix = `//${url.host}${basePath}`;
  const hostPrefix = `//${url.host}/`;
  const token =
    config.values.get(`${authPrefix}:_authToken`) ?? config.values.get(`${hostPrefix}:_authToken`);
  const basic =
    config.values.get(`${authPrefix}:_auth`) ?? config.values.get(`${hostPrefix}:_auth`);
  if (token !== undefined && token !== '') headers.set('authorization', `Bearer ${token}`);
  else if (basic !== undefined && basic !== '') headers.set('authorization', `Basic ${basic}`);
  return headers;
}

/*** Normalize registry base URLs before package URL resolution. */
function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

export type ApmRegistryFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ApmRegistryRequestOptions {
  readonly fetchFn?: ApmRegistryFetch;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly home?: string;
}

export interface ApmRegistryAvailabilityOptions extends ApmRegistryRequestOptions {
  readonly now?: () => number;
  readonly maxRequests?: number;
  readonly cacheTtlMs?: number;
}

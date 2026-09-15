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
  /** Maximum distinct registry names selected per inspection (default 4096); cached evidence still applies outside this budget. */
  readonly maxRequests?: number;
  /** Maximum simultaneous registry requests per inspection (default 8, supported range 1–64). */
  readonly concurrency?: number;
  readonly cacheTtlMs?: number;
}

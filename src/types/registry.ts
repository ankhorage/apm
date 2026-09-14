export type ApmRegistryFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ApmRegistryAvailabilityOptions {
  readonly fetchFn?: ApmRegistryFetch;
  readonly now?: () => number;
  readonly maxRequests?: number;
  readonly cacheTtlMs?: number;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly home?: string;
}

import { homedir } from 'node:os';

import { groupBy } from '@ankhorage/utility/collection';

import type {
  ApmRegistryAvailabilityOptions,
  ApmRegistryFetch,
} from '../../../../types/registry.js';
import type {
  ApmAvailabilityEvidence,
  ApmAvailabilityRequest,
  ApmPackageAvailabilityEvidence,
  ApmStatusAvailabilityPort,
  ApmStatusDiagnostic,
} from '../../../../types/status.js';
import type { ApmRegistryCacheEntry } from '../../../../types/status-registry.js';
import { readRegistryConfigAsync } from '../../../../utils/readRegistryConfigAsync.js';
import { queryRegistryPackageGroupAsync } from './queryRegistryPackageGroupAsync.js';

/*** Create a bounded npm-compatible registry adapter with redacted config and process-local TTL cache. */
export function createNpmRegistryAvailabilityPort(
  options: ApmRegistryAvailabilityOptions = {},
): ApmStatusAvailabilityPort {
  const fetchFn: ApmRegistryFetch = options.fetchFn ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const maxRequests = options.maxRequests ?? 4096;
  const concurrency = options.concurrency ?? 8;
  validateRegistryLimits(maxRequests, concurrency, options.cacheTtlMs ?? 5 * 60 * 1000);
  const cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
  const cache = new Map<string, ApmRegistryCacheEntry>();
  return {
    queryAvailabilityAsync: (input) =>
      inspectRegistryAvailabilityAsync(input, {
        options,
        fetchFn,
        now,
        maxRequests,
        concurrency,
        cacheTtlMs,
        cache,
      }),
  };
}

interface RegistryContext {
  readonly options: ApmRegistryAvailabilityOptions;
  readonly fetchFn: ApmRegistryFetch;
  readonly now: () => number;
  readonly maxRequests: number;
  readonly concurrency: number;
  readonly cacheTtlMs: number;
  readonly cache: Map<string, ApmRegistryCacheEntry>;
}

/*** Inspect all registry groups through bounded batches while preserving original instance order. */
async function inspectRegistryAvailabilityAsync(
  input: Parameters<ApmStatusAvailabilityPort['queryAvailabilityAsync']>[0],
  context: RegistryContext,
): Promise<ApmAvailabilityEvidence> {
  const { options, fetchFn, now, maxRequests, concurrency, cacheTtlMs, cache } = context;

  const config = await readRegistryConfigAsync({
    rootPath: input.rootPath,
    env: options.env ?? process.env,
    home: options.home ?? homedir(),
  });
  const groups = [
    ...groupBy(input.packages.filter(needsRegistry), (request) => request.name).values(),
  ];
  const packagesById = new Map<string, ApmPackageAvailabilityEvidence>();
  // Batch only the HTTP boundary; keep instance ordering deterministic when assembling evidence.
  const batches = Array.from(
    { length: Math.ceil(groups.length / concurrency) },
    (_, batch) => batch,
  );
  for (const batch of batches) {
    await Promise.all(
      groups.slice(batch * concurrency, (batch + 1) * concurrency).map(async (requests, offset) => {
        const evidence = await queryRegistryPackageGroupAsync({
          requests,
          mode: input.mode,
          allowNetwork: batch * concurrency + offset < maxRequests,
          config,
          fetchFn,
          now,
          cacheTtlMs,
          cache,
        });
        for (const item of evidence) packagesById.set(item.packageId, item);
      }),
    );
  }
  const packages = input.packages.map((request) =>
    !needsRegistry(request)
      ? notApplicable(request)
      : (packagesById.get(request.packageId) ??
        unknownAvailability(request, 'Registry evidence was not returned.')),
  );
  return buildAvailabilityEvidence(packages, groups.length, maxRequests);
}

/*** Determine whether a package source can meaningfully be queried through an npm-compatible registry. */
function needsRegistry(request: ApmAvailabilityRequest): boolean {
  return request.role === 'host' || request.source === undefined || request.source === 'registry';
}

/*** Mark workspace/file/git packages as intentionally outside registry availability checks. */
function notApplicable(request: ApmAvailabilityRequest): ApmPackageAvailabilityEvidence {
  return {
    packageId: request.packageId,
    name: request.name,
    state: 'not-applicable',
    reason: `Package source ${request.source ?? 'unknown'} is not registry-backed.`,
  };
}

/*** Return explicit unknown package availability when the bounded registry budget is exceeded. */
function unknownAvailability(
  request: ApmAvailabilityRequest,
  reason: string,
): ApmPackageAvailabilityEvidence {
  return { packageId: request.packageId, name: request.name, state: 'unknown', reason };
}

/*** Assemble availability completeness and stable diagnostics from package-level evidence. */
function buildAvailabilityEvidence(
  packages: readonly ApmPackageAvailabilityEvidence[],
  registryRequestCount: number,
  maxRequests: number,
): ApmAvailabilityEvidence {
  return {
    complete: packages.every((item) => item.state !== 'unknown'),
    packages,
    diagnostics: [
      ...packages.flatMap(availabilityDiagnostic),
      ...(packages.some(
        (item) =>
          item.reason === 'Registry request budget was exhausted for uncached package names.',
      )
        ? [requestLimitDiagnostic(registryRequestCount, maxRequests)]
        : []),
    ],
  };
}

/*** Turn unknown availability into a stable actionable diagnostic without credentials. */
function availabilityDiagnostic(
  item: ApmPackageAvailabilityEvidence,
): readonly ApmStatusDiagnostic[] {
  if (item.state !== 'unknown') return [];
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

/*** Explain a bounded registry request batch that could not inspect every registry-backed package. */
function requestLimitDiagnostic(requested: number, limit: number): ApmStatusDiagnostic {
  return {
    code: 'status.registry.request-limit',
    severity: 'warning',
    scope: { kind: 'registry' },
    evidence: [`requested ${requested}`, `limit ${limit}`],
    reason: 'Registry availability inspection is bounded and did not query every package.',
    nextAction: 'Reduce the inspected graph or raise the explicit host request budget.',
  };
}

/*** Reject invalid budgets before they can silently remove inspection work or disable resource bounds. */
function validateRegistryLimits(
  maxRequests: number,
  concurrency: number,
  cacheTtlMs: number,
): void {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 0)
    throw new RangeError('maxRequests must be a non-negative safe integer.');
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 64)
    throw new RangeError('concurrency must be an integer from 1 to 64.');
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0)
    throw new RangeError('cacheTtlMs must be a non-negative finite number.');
}

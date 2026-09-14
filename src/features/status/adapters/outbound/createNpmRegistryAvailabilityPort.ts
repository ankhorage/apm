import { homedir } from 'node:os';

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
import { queryRegistryPackageAsync } from './queryRegistryPackageAsync.js';

/*** Create a bounded npm-compatible registry adapter with redacted config and process-local TTL cache. */
export function createNpmRegistryAvailabilityPort(
  options: ApmRegistryAvailabilityOptions = {},
): ApmStatusAvailabilityPort {
  const fetchFn: ApmRegistryFetch = options.fetchFn ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const maxRequests = options.maxRequests ?? 64;
  const cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
  const cache = new Map<string, ApmRegistryCacheEntry>();
  return {
    queryAvailabilityAsync: async (input) => {
      const config = await readRegistryConfigAsync({
        rootPath: input.rootPath,
        env: options.env ?? process.env,
        home: options.home ?? homedir(),
      });
      const registryRequests = input.packages.filter(needsRegistry);
      const allowedIds = new Set(
        registryRequests.slice(0, maxRequests).map((request) => request.packageId),
      );
      const packages = await Promise.all(
        input.packages.map((request) => {
          if (!needsRegistry(request)) return Promise.resolve(notApplicable(request));
          if (!allowedIds.has(request.packageId)) {
            return Promise.resolve(
              unknownAvailability(request, `Registry request limit ${maxRequests} was reached.`),
            );
          }
          return queryRegistryPackageAsync({
            request,
            mode: input.mode,
            config,
            fetchFn,
            now,
            cacheTtlMs,
            cache,
          });
        }),
      );
      return buildAvailabilityEvidence(packages, registryRequests.length, maxRequests);
    },
  };
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
      ...(registryRequestCount <= maxRequests
        ? []
        : [requestLimitDiagnostic(registryRequestCount, maxRequests)]),
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

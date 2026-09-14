import type { ApmExtensionEvidence, ApmStatusFinding } from '../../../types/status.js';

/*** Convert extension-owned projection and migration observations into status findings. */
export function evaluateExtensionFindings(
  extensions: ApmExtensionEvidence,
): readonly ApmStatusFinding[] {
  return extensions.observations.flatMap((observation, index) => {
    const id = observation.packageId ?? observation.owner ?? `extension:${index}`;
    return [
      ...(observation.projection === 'stale'
        ? [{
            code: 'projection-stale' as const,
            scope: { kind: 'projection' as const, id },
            evidence: observation.evidence,
            reason: observation.reason ?? 'An owned generated projection differs from current source state.',
            ...(observation.nextAction === undefined ? {} : { nextAction: observation.nextAction }),
          }]
        : []),
      ...(observation.migration === 'pending'
        ? [{
            code: 'migration-pending' as const,
            scope: { kind: 'migration' as const, id },
            evidence: observation.evidence,
            reason: observation.reason ?? 'A package-owned migration is pending for this project state.',
            ...(observation.nextAction === undefined ? {} : { nextAction: observation.nextAction }),
          }]
        : []),
    ];
  });
}

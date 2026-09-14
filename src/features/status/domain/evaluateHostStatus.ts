import { gt, valid } from 'semver';

import type {
  ApmAvailabilityEvidence,
  ApmPackageAvailabilityEvidence,
  ApmStatusFinding,
  ApmStatusHostPackage,
  ApmStatusHostPackageResult,
} from '../../../types/status.js';

/*** Evaluate one host package separately from application dependency instances. */
export function evaluateHostStatus(
  host: ApmStatusHostPackage,
  availability: ApmAvailabilityEvidence,
): ApmStatusHostPackageResult {
  const packageId = `host:${host.id}`;
  const evidence = findAvailability(packageId, host.name, availability);
  return {
    ...host,
    availability: evidence,
    findings: hostFindings(host, evidence),
  };
}

/*** Derive host-update or availability-unknown findings from registry evidence. */
function hostFindings(
  host: ApmStatusHostPackage,
  evidence: ApmPackageAvailabilityEvidence,
): readonly ApmStatusFinding[] {
  if (evidence.state === 'unknown') {
    return [{
      code: 'availability-unknown',
      scope: { kind: 'host', id: host.id },
      evidence: [evidence.reason ?? 'Registry availability evidence is unavailable.'],
      reason: 'Host package availability could not be established.',
    }];
  }
  if (
    evidence.state !== 'known' ||
    evidence.latestVersion === undefined ||
    valid(host.version) === null ||
    !gt(evidence.latestVersion, host.version)
  ) {
    return [];
  }
  return [{
    code: 'host-update',
    scope: { kind: 'host', id: host.id },
    evidence: [`installed host ${host.version}`, `latest ${evidence.latestVersion}`],
    reason: 'A newer host or extension package is available separately from application updates.',
    nextAction: 'Upgrade the host at its own restart boundary before dependent updates when required.',
  }];
}

/*** Look up host availability by stable request identity and preserve missing evidence as unknown. */
function findAvailability(
  packageId: string,
  name: string,
  availability: ApmAvailabilityEvidence,
): ApmPackageAvailabilityEvidence {
  return availability.packages.find((item) => item.packageId === packageId) ?? {
    packageId,
    name,
    state: 'unknown',
    reason: 'No availability evidence was returned for this host package.',
  };
}

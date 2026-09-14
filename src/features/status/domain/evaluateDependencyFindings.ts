import { gt, satisfies, valid, validRange } from 'semver';

import type {
  ApmDependencyDeclaration,
  ApmInstalledPackageEvidence,
  ApmLockedPackageEvidence,
  ApmPackageAvailabilityEvidence,
  ApmStatusFinding,
} from '../../../types/status.js';

/*** Derive dependency drift findings only from explicit declaration, lock, install, and availability evidence. */
export function evaluateDependencyFindings(input: EvaluateDependencyFindingsInput): readonly ApmStatusFinding[] {
  return [
    ...declarationFindings(input),
    ...installationFindings(input),
    ...availabilityFindings(input),
  ];
}

interface EvaluateDependencyFindingsInput {
  readonly packageId: string;
  readonly lockfilePath?: string;
  readonly pkg: ApmLockedPackageEvidence;
  readonly declaration?: ApmDependencyDeclaration;
  readonly installed: ApmInstalledPackageEvidence;
  readonly availability: ApmPackageAvailabilityEvidence;
}

/*** Detect declaration/lock divergence only when both sides are semantic-version evidence. */
function declarationFindings(input: EvaluateDependencyFindingsInput): readonly ApmStatusFinding[] {
  const declaration = input.declaration;
  const version = input.pkg.version;
  if (
    declaration === undefined ||
    version === undefined ||
    valid(version) === null ||
    validRange(declaration.range) === null ||
    satisfies(version, declaration.range)
  ) {
    return [];
  }
  const evidence = [
    `${declaration.ownerPath}: ${input.pkg.name}@${declaration.range}`,
    `${input.lockfilePath ?? 'lockfile'}: ${version}`,
  ];
  return [
    {
      code: 'declared-changed',
      scope: packageScope(input.packageId),
      evidence,
      reason: 'The declared dependency constraint no longer accepts the locked version.',
      nextAction: 'Regenerate the lockfile through the selected package manager.',
    },
    {
      code: 'lock-stale',
      scope: packageScope(input.packageId),
      evidence,
      reason: 'The lockfile resolution is stale relative to the package declaration.',
      nextAction: 'Resolve dependencies again before applying package changes.',
    },
  ];
}

/*** Report required package absence while allowing platform-specific optional packages to be absent. */
function installationFindings(input: EvaluateDependencyFindingsInput): readonly ApmStatusFinding[] {
  if (input.installed.state !== 'absent' || input.pkg.optional) return [];
  return [
    {
      code: 'install-absent',
      scope: packageScope(input.packageId),
      evidence: [input.installed.reason ?? 'No installed package evidence was found.'],
      reason: 'The locked package instance is not installed at the inspected project state.',
      nextAction: 'Install dependencies with the selected package manager before verification.',
    },
  ];
}

/*** Compare known registry availability without treating non-registry sources as missing evidence. */
function availabilityFindings(input: EvaluateDependencyFindingsInput): readonly ApmStatusFinding[] {
  if (input.availability.state === 'not-applicable') return [];
  if (input.availability.state === 'unknown') return [unknownAvailabilityFinding(input)];
  const current = input.pkg.version;
  const latest = input.availability.latestVersion;
  if (current === undefined || latest === undefined || valid(current) === null || !gt(latest, current)) {
    return [];
  }
  if (input.declaration === undefined) return [transitiveUpdateFinding(input, current, latest)];
  const compatible = input.availability.compatibleVersion;
  if (compatible !== undefined && valid(compatible) !== null && gt(compatible, current)) {
    return [directUpdateFinding(input, current, compatible, latest)];
  }
  return [constraintBlockedFinding(input, current, latest)];
}

/*** Build availability-unknown finding with no implication that no update exists. */
function unknownAvailabilityFinding(input: EvaluateDependencyFindingsInput): ApmStatusFinding {
  return {
    code: 'availability-unknown',
    scope: packageScope(input.packageId),
    evidence: [input.availability.reason ?? 'Registry availability evidence is unavailable.'],
    reason: 'Available package versions could not be established.',
    nextAction: 'Refresh registry evidence with working registry access.',
  };
}

/*** Build one transitive-update finding for a newer registry package instance. */
function transitiveUpdateFinding(
  input: EvaluateDependencyFindingsInput,
  current: string,
  latest: string,
): ApmStatusFinding {
  return {
    code: 'transitive-update',
    scope: packageScope(input.packageId),
    evidence: [`locked ${current}`, `latest ${latest}`],
    reason: 'A newer version exists for this transitive package instance.',
  };
}

/*** Build one compatible direct-update finding. */
function directUpdateFinding(
  input: EvaluateDependencyFindingsInput,
  current: string,
  compatible: string,
  latest: string,
): ApmStatusFinding {
  return {
    code: 'direct-update',
    scope: packageScope(input.packageId),
    evidence: [`locked ${current}`, `compatible ${compatible}`, `latest ${latest}`],
    reason: 'A newer version is available within the declared dependency constraint.',
  };
}

/*** Explain a newer package release blocked by the current declaration. */
function constraintBlockedFinding(
  input: EvaluateDependencyFindingsInput,
  current: string,
  latest: string,
): ApmStatusFinding {
  return {
    code: 'constraint-blocked',
    scope: packageScope(input.packageId),
    evidence: [`locked ${current}`, `declared ${input.declaration?.range ?? 'unknown'}`, `latest ${latest}`],
    reason: 'A newer version exists but the current declaration does not admit it.',
    nextAction: 'Review the declaration before planning a constraint-changing update.',
  };
}

/*** Build the common package scope for status findings. */
function packageScope(packageId: string): { readonly kind: 'package'; readonly id: string } {
  return { kind: 'package', id: packageId };
}

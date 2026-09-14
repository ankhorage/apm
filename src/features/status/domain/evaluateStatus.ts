import type { ProjectInspection } from '@ankhorage/project-detector/types';

import type {
  ApmAvailabilityEvidence,
  ApmDependencyInventory,
  ApmExtensionEvidence,
  ApmStatusDiagnostic,
  ApmStatusHostPackage,
  ApmStatusResult,
} from '../../../types/status.js';
import { evaluateDependencies } from './evaluateDependencies.js';
import { evaluateExtensionFindings } from './evaluateExtensionFindings.js';
import { evaluateHostStatus } from './evaluateHostStatus.js';

/*** Combine independent evidence sources into one conservative status result. */
export function evaluateStatus(input: EvaluateStatusInput): ApmStatusResult {
  const dependencies = input.inventory.roots.flatMap((root) =>
    evaluateDependencies(root, input.availability),
  );
  const hosts = input.hostPackages.map((host) => evaluateHostStatus(host, input.availability));
  const findings = [
    ...dependencies.flatMap((dependency) => dependency.findings),
    ...hosts.flatMap((host) => host.findings),
    ...evaluateExtensionFindings(input.extensions),
  ];
  const diagnostics = [
    ...input.inspection.diagnostics.map(toInspectionDiagnostic),
    ...input.inventory.diagnostics,
    ...input.availability.diagnostics,
    ...input.extensions.diagnostics,
  ];
  const complete =
    input.inspection.complete &&
    input.inventory.complete &&
    input.availability.complete &&
    input.extensions.complete;
  return {
    schemaVersion: 2,
    operation: 'status',
    rootPath: input.inspection.rootPath,
    complete,
    currency: !complete ? 'unknown' : findings.length > 0 ? 'outdated' : 'current',
    project: projectSummary(input.inspection),
    installRoots: input.inventory.roots,
    dependencies,
    hosts,
    extensions: input.extensions,
    findings,
    diagnostics,
  };
}

interface EvaluateStatusInput {
  readonly inspection: ProjectInspection;
  readonly inventory: ApmDependencyInventory;
  readonly availability: ApmAvailabilityEvidence;
  readonly extensions: ApmExtensionEvidence;
  readonly hostPackages: readonly ApmStatusHostPackage[];
}

/*** Build the stable project summary from read-only Project Detector evidence. */
function projectSummary(inspection: ProjectInspection): ApmStatusResult['project'] {
  return {
    traits: [...inspection.detection.traits],
    languages: inspection.detection.languages.map((language) => ({
      id: language.id,
      score: language.score,
      sourceRoots: [...language.sourceRoots],
    })),
    packageManagers: [...inspection.detection.packageManagers],
    buildTools: [...inspection.detection.buildTools],
    packageCount: inspection.packages.length,
    workspaceCount: inspection.workspaces.length,
  };
}

/*** Normalize Project Detector diagnostics into APM's stable diagnostic shape. */
function toInspectionDiagnostic(
  diagnostic: ProjectInspection['diagnostics'][number],
): ApmStatusDiagnostic {
  return {
    code: `project-detector.${diagnostic.code}`,
    severity: 'warning',
    scope: {
      kind: 'project',
      ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
    },
    evidence: diagnostic.path === undefined ? [] : [diagnostic.path],
    reason: diagnostic.message,
    nextAction: 'Resolve incomplete project inspection evidence before treating status as current.',
  };
}

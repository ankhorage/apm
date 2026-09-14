import type {
  ApmStatusInput,
  ApmStatusInspectionPort,
  ApmStatusResult,
} from '../../../types/status.js';

/***
 * Build serializable APM status from read-only project evidence supplied by an outbound port.
 *
 * Hosts can call this use case without a terminal, filesystem access, or Node composition and can
 * provide a deterministic fake port in tests. Status never installs dependencies or executes
 * project lifecycle scripts.
 * @readme
 */
export async function statusAsync(
  input: ApmStatusInput,
  inspectionPort: ApmStatusInspectionPort,
): Promise<ApmStatusResult> {
  const inspection = await inspectionPort.inspectProjectAsync(input.rootPath);

  return {
    schemaVersion: 1,
    operation: 'status',
    rootPath: inspection.rootPath,
    complete: inspection.complete,
    project: {
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
    },
    diagnostics: inspection.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
    })),
  };
}

import type { ProjectInspection } from '@ankhorage/project-detector/types';

export interface ApmStatusInput {
  readonly rootPath: string;
}

export interface ApmStatusInspectionPort {
  readonly inspectProjectAsync: (rootPath: string) => Promise<ProjectInspection>;
}

export interface ApmStatusDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface ApmStatusLanguage {
  readonly id: string;
  readonly score: number;
  readonly sourceRoots: readonly string[];
}

export interface ApmStatusProjectSummary {
  readonly traits: readonly string[];
  readonly languages: readonly ApmStatusLanguage[];
  readonly packageManagers: readonly string[];
  readonly buildTools: readonly string[];
  readonly packageCount: number;
  readonly workspaceCount: number;
}

export interface ApmStatusResult {
  readonly schemaVersion: 1;
  readonly operation: 'status';
  readonly rootPath: string;
  readonly complete: boolean;
  readonly project: ApmStatusProjectSummary;
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

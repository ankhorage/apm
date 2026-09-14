import type { ApmStatusExtensionEvidencePort, ApmStatusInput, ApmStatusResult } from './status.js';

/*** Reusable project-status boundary shared by planning, apply validation, and verification composition. */
export interface ApmProjectStatusPort {
  readonly inspectStatusAsync: (input: ApmStatusInput) => Promise<ApmStatusResult>;
}

/*** Optional owner-specific status evidence composed around the default Node status adapters. */
export interface ApmStatusProjectOptions {
  readonly extensions?: ApmStatusExtensionEvidencePort;
}

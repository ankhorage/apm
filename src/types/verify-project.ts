import type { ApmProjectStatusPort } from './status-project.js';
import type { ApmVerifyStepPort } from './verify.js';

export interface ApmVerifyProjectOptions {
  readonly ownerStep?: ApmVerifyStepPort;
  readonly status?: ApmProjectStatusPort;
}

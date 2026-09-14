import type { ApmApplyCancellationPort, ApmApplyProgressPort, ApmApplyStepPort } from './apply.js';
import type { ApmProjectStatusPort } from './status-project.js';

export interface ApmApplyProjectOptions {
  readonly ownerStep?: ApmApplyStepPort;
  readonly progress?: ApmApplyProgressPort;
  readonly cancellation?: ApmApplyCancellationPort;
  readonly status?: ApmProjectStatusPort;
}

import type { ApmApplyCancellationPort, ApmApplyProgressPort, ApmApplyStepPort } from './apply.js';

export interface ApmApplyProjectOptions {
  readonly ownerStep?: ApmApplyStepPort;
  readonly progress?: ApmApplyProgressPort;
  readonly cancellation?: ApmApplyCancellationPort;
}

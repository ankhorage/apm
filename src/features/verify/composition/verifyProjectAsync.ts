import type { ApmVerifyInput, ApmVerifyResult } from '../../../types/verify.js';
import type { ApmVerifyProjectOptions } from '../../../types/verify-project.js';
import { inspectProjectStatusAsync } from '../../../utils/inspectProjectStatusAsync.js';
import { createNodeApplyJournalPort } from '../../apply/adapters/outbound/createNodeApplyJournalPort.js';
import { createSha256PlanDigestPort } from '../../plan/adapters/outbound/createSha256PlanDigestPort.js';
import { createNodeVerifyStepPort } from '../adapters/outbound/createNodeVerifyStepPort.js';
import { verifyAsync } from '../application/verifyAsync.js';

const digest = createSha256PlanDigestPort();

/*** Compose durable Node journal/status/postcondition adapters behind the shared headless verify use case. */
export async function verifyProjectAsync(
  input: ApmVerifyInput,
  options: ApmVerifyProjectOptions = {},
): Promise<ApmVerifyResult> {
  return verifyAsync(input, {
    journal: createNodeApplyJournalPort(),
    status: {
      inspectStatusAsync: (rootPath) =>
        inspectProjectStatusAsync({ rootPath, availability: 'refresh' }, options.status),
    },
    step: createNodeVerifyStepPort({
      digest,
      ...(options.ownerStep === undefined ? {} : { owner: options.ownerStep }),
    }),
  });
}

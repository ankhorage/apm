import metadata from '../../../../package.json' with { type: 'json' };
import type {
  ApmPlanProjectInput,
  ApmPlanProjectOptions,
  ApmPlanResult,
} from '../../../types/plan.js';
import { inspectProjectStatusAsync } from '../../../utils/inspectProjectStatusAsync.js';
import { createNativePlanResolutionPort } from '../adapters/outbound/createNativePlanResolutionPort.js';
import { createSha256PlanDigestPort } from '../adapters/outbound/createSha256PlanDigestPort.js';
import { planAsync } from '../application/planAsync.js';

const digestPort = createSha256PlanDigestPort();
const resolutionPort = createNativePlanResolutionPort();

/*** Compose project status and native Node planning adapters behind the shared headless plan use case. */
export async function planProjectAsync(
  input: ApmPlanProjectInput,
  options: ApmPlanProjectOptions = {},
): Promise<ApmPlanResult> {
  const status = await inspectProjectStatusAsync(
    {
      rootPath: input.rootPath,
      availability: input.availability ?? 'refresh',
    },
    options.status,
  );
  return planAsync(
    {
      status,
      ...(input.policy === undefined ? {} : { policy: input.policy }),
      executor: {
        apmVersion: metadata.version,
        runtime: 'node',
        runtimeVersion: process.versions.node,
      },
    },
    {
      digest: digestPort,
      resolution: resolutionPort,
      ...(options.protocol === undefined ? {} : { protocol: options.protocol }),
    },
  );
}

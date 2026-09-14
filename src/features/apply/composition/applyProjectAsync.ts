import { randomUUID } from 'node:crypto';

import metadata from '../../../../package.json' with { type: 'json' };
import type { ApmApplyProjectOptions } from '../../../types/apply-project.js';
import type { ApmApplyInput, ApmApplyPorts, ApmApplyResult } from '../../../types/apply.js';
import { createSha256PlanDigestPort } from '../../plan/adapters/outbound/createSha256PlanDigestPort.js';
import { validateSavedPlanAsync } from '../../plan/domain/validateSavedPlanAsync.js';
import { statusProjectAsync } from '../../status/composition/statusProjectAsync.js';
import { createNodeApplyJournalPort } from '../adapters/outbound/createNodeApplyJournalPort.js';
import { createNodeApplyLockPort } from '../adapters/outbound/createNodeApplyLockPort.js';
import { createNodeApplyStepPort } from '../adapters/outbound/createNodeApplyStepPort.js';
import { applyAsync } from '../application/applyAsync.js';

const digest = createSha256PlanDigestPort();

/*** Compose durable Node execution/recovery adapters behind the shared headless apply use case. */
export async function applyProjectAsync(
  input: ApmApplyInput,
  options: ApmApplyProjectOptions = {},
): Promise<ApmApplyResult> {
  const executor = currentExecutor();
  const ports: ApmApplyPorts = {
    clock: { nowIso: () => new Date().toISOString() },
    operationId: { createOperationId: randomUUID },
    lock: createNodeApplyLockPort(),
    journal: createNodeApplyJournalPort(),
    status: {
      inspectStatusAsync: (rootPath) => statusProjectAsync({ rootPath, availability: 'refresh' }),
    },
    planValidation: {
      validateAsync: ({ plan, status, executor: current }) =>
        validateSavedPlanAsync(plan, status, current, digest),
    },
    executor: { current: () => executor },
    step: createNodeApplyStepPort({
      digest,
      ...(options.ownerStep === undefined ? {} : { owner: options.ownerStep }),
    }),
    ...(options.progress === undefined ? {} : { progress: options.progress }),
    ...(options.cancellation === undefined ? {} : { cancellation: options.cancellation }),
  };
  return applyAsync(input, ports);
}

/*** Freeze the current public APM/Node executor identity used by saved-plan validation and recovery. */
function currentExecutor() {
  return {
    apmVersion: metadata.version,
    runtime: 'node' as const,
    runtimeVersion: process.versions.node,
  };
}

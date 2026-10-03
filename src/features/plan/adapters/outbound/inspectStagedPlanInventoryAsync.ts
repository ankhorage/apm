import path from 'node:path';

import { inspectProjectAsync } from '@ankhorage/project-detector/node';

import type { ApmPlanResolutionRequest } from '../../../../types/plan.js';
import type { ApmPlanStage } from '../../../../types/plan-staging.js';
import type {
  ApmInstallRootInventory,
  ApmStatusDiagnostic,
} from '../../../../types/status.js';
import { inspectDependencyInventoryAsync } from '../../../status/adapters/outbound/inspectDependencyInventoryAsync.js';

export interface ApmStagedPlanInventoryInspection {
  readonly root?: ApmInstallRootInventory;
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

/*** Re-inspect the staged native lock graph using the same tested status adapters as project status. */
export async function inspectStagedPlanInventoryAsync(
  request: ApmPlanResolutionRequest,
  stage: ApmPlanStage,
): Promise<ApmStagedPlanInventoryInspection> {
  const inspection = await inspectProjectAsync(stage.rootPath);
  const inventory = await inspectDependencyInventoryAsync({ inspection });
  const root = inventory.roots.find(
    (candidate) => path.resolve(candidate.rootPath) === path.resolve(stage.rootPath),
  );
  if (root?.manager.name !== request.manager || !root.complete) {
    return { diagnostics: inventory.diagnostics };
  }
  return { root, diagnostics: inventory.diagnostics };
}

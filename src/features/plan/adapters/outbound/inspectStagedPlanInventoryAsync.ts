import path from 'node:path';

import { inspectProjectAsync } from '@ankhorage/project-detector/node';

import type { ApmPlanResolutionRequest } from '../../../../types/plan.js';
import type { ApmPlanStage } from '../../../../types/plan-staging.js';
import type { ApmInstallRootInventory } from '../../../../types/status.js';
import { inspectDependencyInventoryAsync } from '../../../status/adapters/outbound/inspectDependencyInventoryAsync.js';

/*** Re-inspect the staged native lock graph using the same tested status adapters as project status. */
export async function inspectStagedPlanInventoryAsync(
  request: ApmPlanResolutionRequest,
  stage: ApmPlanStage,
): Promise<ApmInstallRootInventory | undefined> {
  const inspection = await inspectProjectAsync(stage.rootPath);
  const inventory = await inspectDependencyInventoryAsync({ inspection });
  const root = inventory.roots.find(
    (candidate) => path.resolve(candidate.rootPath) === path.resolve(stage.rootPath),
  );
  if (root?.manager.name !== request.manager || !root.complete) return undefined;
  return root;
}

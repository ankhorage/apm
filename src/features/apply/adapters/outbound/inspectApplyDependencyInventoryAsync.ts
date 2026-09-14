import { inspectProjectAsync } from '@ankhorage/project-detector/node';

import type { ApmDependencyInventory } from '../../../../types/status.js';
import { inspectDependencyInventoryAsync } from '../../../status/adapters/outbound/inspectDependencyInventoryAsync.js';

/*** Reuse Project Detector and status inventory adapters to inspect local dependency state without registry access. */
export async function inspectApplyDependencyInventoryAsync(
  rootPath: string,
): Promise<ApmDependencyInventory> {
  const inspection = await inspectProjectAsync(rootPath);
  return inspectDependencyInventoryAsync({ inspection });
}

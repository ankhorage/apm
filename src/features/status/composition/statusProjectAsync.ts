import { inspectProjectAsync } from '@ankhorage/project-detector/node';

import metadata from '../../../../package.json' with { type: 'json' };
import type { ApmStatusInput, ApmStatusResult } from '../../../types/status.js';
import type { ApmStatusProjectOptions } from '../../../types/status-project.js';
import { createNpmRegistryAvailabilityPort } from '../adapters/outbound/createNpmRegistryAvailabilityPort.js';
import { inspectDependencyInventoryAsync } from '../adapters/outbound/inspectDependencyInventoryAsync.js';
import { statusAsync } from '../application/statusAsync.js';

/*** Compose APM status with published Project Detector, local package-manager, registry, and optional owner-extension evidence. */
export async function statusProjectAsync(
  input: ApmStatusInput,
  options: ApmStatusProjectOptions = {},
): Promise<ApmStatusResult> {
  return statusAsync(
    {
      ...input,
      hostPackages: input.hostPackages ?? [
        { id: 'apm', name: metadata.name, version: metadata.version },
      ],
    },
    {
      projectInspection: { inspectProjectAsync },
      dependencyInventory: { inspectDependencyInventoryAsync },
      availability: registryAvailabilityPort,
      ...(options.extensions === undefined ? {} : { extensions: options.extensions }),
    },
  );
}

const registryAvailabilityPort = createNpmRegistryAvailabilityPort();

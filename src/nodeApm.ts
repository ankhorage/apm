export {
  APM_STATUS_SUPPORT,
  resolveMigrationPath,
  statusAsync,
  validateUpdateDescriptor,
  validateUpdateExtensionBinding,
  validateUpdateExtensionCapabilities,
} from './apm.js';
export { createNpmRegistryAvailabilityPort } from './features/status/adapters/outbound/createNpmRegistryAvailabilityPort.js';
export { inspectDependencyInventoryAsync } from './features/status/adapters/outbound/inspectDependencyInventoryAsync.js';
export { statusProjectAsync } from './features/status/composition/statusProjectAsync.js';
export type * from './types/public.js';

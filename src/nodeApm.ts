export {
  APM_STATUS_SUPPORT,
  planAsync,
  resolveMigrationPath,
  statusAsync,
  validatePackageUpdateMetadata,
  validateSavedPlanAsync,
  validateUpdateDescriptor,
  validateUpdateExtensionBinding,
  validateUpdateExtensionCapabilities,
} from './apm.js';
export { createNativePlanResolutionPort } from './features/plan/adapters/outbound/createNativePlanResolutionPort.js';
export { createSha256PlanDigestPort } from './features/plan/adapters/outbound/createSha256PlanDigestPort.js';
export { planProjectAsync } from './features/plan/composition/planProjectAsync.js';
export { createNpmRegistryAvailabilityPort } from './features/status/adapters/outbound/createNpmRegistryAvailabilityPort.js';
export { inspectDependencyInventoryAsync } from './features/status/adapters/outbound/inspectDependencyInventoryAsync.js';
export { statusProjectAsync } from './features/status/composition/statusProjectAsync.js';
export type * from './types/public.js';

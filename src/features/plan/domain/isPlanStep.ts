import { isRecord } from '@ankhorage/utility/object';

import type { ApmPlanStep } from '../../../types/plan.js';
import type { ApmPlanStepExecution } from '../../../types/plan-execution.js';
import { isApmMigrationDescriptor } from '../../update-protocol/domain/isApmMigrationDescriptor.js';
import { isApmProjectionDescriptor } from '../../update-protocol/domain/isApmProjectionDescriptor.js';
import { isApmProjectMutation } from '../../update-protocol/domain/isApmProjectMutation.js';
import { isApmReleaseEffect } from '../../update-protocol/domain/isApmReleaseEffect.js';

/*** Validate one executable serialized plan step before apply or recovery can trust it. */
export function isPlanStep(value: unknown): value is ApmPlanStep {
  if (!isRecord(value) || !isStepKind(value.kind)) return false;
  return (
    typeof value.id === 'string' &&
    isStringArray(value.prerequisites) &&
    optionalString(value.installRootId) &&
    optionalString(value.owner) &&
    typeof value.reason === 'string' &&
    isStringArray(value.evidence) &&
    isPlanStepExecution(value.execution) &&
    value.execution.kind === value.kind
  );
}

/*** Validate every supported executable step descriptor variant. */
function isPlanStepExecution(value: unknown): value is ApmPlanStepExecution {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'dependency-files':
      return isStringArray(value.filePaths);
    case 'install':
      return (
        typeof value.installRootPath === 'string' &&
        isPackageManager(value.manager) &&
        optionalString(value.managerVersion) &&
        optionalString(value.linker) &&
        isStringArray(value.packageIds) &&
        typeof value.lifecycleScripts === 'boolean'
      );
    case 'migration':
      return (
        isApmMigrationDescriptor(value.descriptor) &&
        isExtensionArtifact(value.artifact) &&
        isMigrationPlan(value.plan)
      );
    case 'projection':
      return (
        isApmProjectionDescriptor(value.descriptor) &&
        isExtensionArtifact(value.artifact) &&
        isProjectionPlan(value.plan)
      );
    case 'validation':
      return Array.isArray(value.checks) && value.checks.every(isValidationCheck);
    case 'host-restart':
      return typeof value.hostId === 'string' && typeof value.requiredVersion === 'string';
    case 'follow-up':
      return isApmReleaseEffect(value.effect);
    default:
      return false;
  }
}

/*** Validate immutable owner artifact identity frozen into an executable owner step. */
function isExtensionArtifact(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.role === 'source' || value.role === 'target' || value.role === 'intermediate') &&
    typeof value.packageName === 'string' &&
    typeof value.version === 'string' &&
    typeof value.integrity === 'string' &&
    typeof value.descriptorDigest === 'string'
  );
}

/*** Validate a reviewed migration plan embedded in a serialized executable step. */
function isMigrationPlan(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.migrationId === 'string' &&
    Array.isArray(value.mutations) &&
    value.mutations.every(isApmProjectMutation) &&
    isStringArray(value.evidence) &&
    typeof value.inputFingerprint === 'string'
  );
}

/*** Validate a reviewed projection plan embedded in a serialized executable step. */
function isProjectionPlan(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.projectionId === 'string' &&
    Array.isArray(value.mutations) &&
    value.mutations.every(isApmProjectMutation) &&
    typeof value.inputFingerprint === 'string' &&
    typeof value.generatorFingerprint === 'string' &&
    isStringArray(value.evidence)
  );
}

/*** Validate one structured project validation check from a reviewed plan. */
function isValidationCheck(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  if (value.kind === 'dependency-state') return true;
  return (
    value.kind === 'command' &&
    typeof value.executable === 'string' &&
    isStringArray(value.args) &&
    optionalString(value.cwd) &&
    optionalNumber(value.timeoutMs)
  );
}

/*** Validate the canonical package-manager identifiers supported by APM. */
function isPackageManager(value: unknown): boolean {
  return value === 'npm' || value === 'pnpm' || value === 'yarn' || value === 'bun';
}

/*** Validate public plan step kinds before comparing them to execution discriminants. */
function isStepKind(value: unknown): value is ApmPlanStep['kind'] {
  return (
    value === 'dependency-files' ||
    value === 'install' ||
    value === 'migration' ||
    value === 'projection' ||
    value === 'validation' ||
    value === 'host-restart' ||
    value === 'follow-up'
  );
}

/*** Validate string arrays without accepting mixed JSON data. */
function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/*** Validate exact-optional strings. */
function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

/*** Validate exact-optional finite numeric fields. */
function optionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

import { isRecord } from '@ankhorage/utility/object';

import type {
  ApmPlanArtifactIdentity,
  ApmPlanBlocker,
  ApmPlanDependencyTarget,
  ApmPlanFileChange,
  ApmPlanPolicy,
  ApmPlanResolvedPackage,
  ApmPlanResult,
} from '../../../types/plan.js';
import type { ApmStatusDiagnostic, ApmStatusFinding } from '../../../types/status.js';
import { isApmReleaseEffect } from '../../update-protocol/domain/isApmReleaseEffect.js';
import { isPlanStep } from './isPlanStep.js';

/*** Parse untrusted JSON into the canonical executable plan schema supported by apply/recovery. */
export function parsePlanResult(value: unknown): ApmPlanResult | undefined {
  if (!isPlanResult(value)) return undefined;
  return value;
}

/*** Validate the complete serializable plan envelope and all executor-relevant nested evidence. */
function isPlanResult(value: unknown): value is ApmPlanResult {
  if (!isRecord(value) || value.schemaVersion !== 2 || value.operation !== 'plan') return false;
  return (
    typeof value.id === 'string' &&
    typeof value.rootPath === 'string' &&
    typeof value.complete === 'boolean' &&
    isPlanPolicy(value.policy) &&
    isExecutor(value.executor) &&
    isInputFingerprint(value.inputFingerprint) &&
    isArrayOf(value.targets, isDependencyTarget) &&
    isArrayOf(value.files, isFileChange) &&
    isArrayOf(value.packages, isResolvedPackage) &&
    isArrayOf(value.artifacts, isArtifactIdentity) &&
    isArrayOf(value.steps, isPlanStep) &&
    isArrayOf(value.effects, isApmReleaseEffect) &&
    isArrayOf(value.findings, isStatusFinding) &&
    isArrayOf(value.blockers, isPlanBlocker) &&
    isArrayOf(value.diagnostics, isStatusDiagnostic)
  );
}

/*** Validate normalized update policy frozen into the reviewed plan. */
function isPlanPolicy(value: unknown): value is ApmPlanPolicy {
  return (
    isRecord(value) &&
    (value.dependencyUpdates === 'safe' ||
      value.dependencyUpdates === 'selected' ||
      value.dependencyUpdates === 'none') &&
    Array.isArray(value.selections) &&
    value.selections.every(isPackageSelection) &&
    typeof value.repairInstallations === 'boolean' &&
    typeof value.repairProjections === 'boolean' &&
    typeof value.maxGeneratorIterations === 'number' &&
    Number.isInteger(value.maxGeneratorIterations) &&
    value.maxGeneratorIterations > 0
  );
}

/*** Validate one explicit user/owner package selection without interpreting semver again. */
function isPackageSelection(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.selector) || !isRecord(value.target)) return false;
  const selector = value.selector;
  const target = value.target;
  const selectorValid =
    typeof selector.name === 'string' &&
    optionalString(selector.packageId) &&
    optionalString(selector.installRootId) &&
    optionalString(selector.ownerPath);
  if (!selectorValid) return false;
  if (target.kind === 'compatible') return true;
  if (target.kind === 'latest') {
    return optionalBoolean(target.allowPrerelease) && optionalString(target.manifestRange);
  }
  return (
    target.kind === 'version' &&
    typeof target.version === 'string' &&
    optionalBoolean(target.allowPrerelease) &&
    optionalBoolean(target.allowDowngrade) &&
    optionalString(target.manifestRange)
  );
}

/*** Validate the exact executor identity that must match before start/resume. */
function isExecutor(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.apmVersion === 'string' &&
    (value.runtime === 'node' || value.runtime === 'browser' || value.runtime === 'other') &&
    optionalString(value.runtimeVersion)
  );
}

/*** Validate the semantic project/status fingerprint stored with the reviewed plan. */
function isInputFingerprint(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.value === 'string' &&
    typeof value.statusSchemaVersion === 'number' &&
    isStringArray(value.availabilityCheckedAt)
  );
}

/*** Validate one exact dependency target selection and its current/target identity. */
function isDependencyTarget(value: unknown): value is ApmPlanDependencyTarget {
  return (
    isRecord(value) &&
    typeof value.installRootId === 'string' &&
    typeof value.packageId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.direct === 'boolean' &&
    optionalString(value.ownerPath) &&
    optionalDependencyKind(value.kind) &&
    optionalString(value.currentRange) &&
    optionalString(value.currentVersion) &&
    typeof value.targetVersion === 'string' &&
    optionalString(value.targetRange) &&
    (value.source === 'compatible' || value.source === 'latest' || value.source === 'exact') &&
    typeof value.reason === 'string'
  );
}

/*** Validate one exact reviewed project file transition. */
function isFileChange(value: unknown): value is ApmPlanFileChange {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    (value.kind === 'create' || value.kind === 'update' || value.kind === 'delete') &&
    optionalString(value.beforeDigest) &&
    optionalString(value.afterDigest) &&
    optionalString(value.beforeContent) &&
    optionalString(value.afterContent)
  );
}

/*** Validate one immutable resolved artifact identity. */
function isArtifactIdentity(value: unknown): value is ApmPlanArtifactIdentity {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.packageName === 'string' &&
    optionalString(value.version) &&
    isArtifactSource(value.source) &&
    optionalString(value.integrity) &&
    optionalString(value.resolved)
  );
}

/*** Validate one resolved package instance while preserving duplicate/peer instance identity. */
function isResolvedPackage(value: unknown): value is ApmPlanResolvedPackage {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    optionalString(value.version) &&
    typeof value.direct === 'boolean' &&
    isArtifactSource(value.source) &&
    optionalString(value.integrity) &&
    isStringArray(value.dependencies) &&
    optionalString(value.peerContext)
  );
}

/*** Validate plan-specific blocker evidence without reinterpreting the reason. */
function isPlanBlocker(value: unknown): value is ApmPlanBlocker {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    isRecord(value.scope) &&
    isPlanBlockerScopeKind(value.scope.kind) &&
    optionalString(value.scope.id) &&
    optionalString(value.scope.path) &&
    isStringArray(value.evidence) &&
    typeof value.reason === 'string' &&
    optionalString(value.nextAction)
  );
}

/*** Validate status finding evidence embedded in the plan snapshot. */
function isStatusFinding(value: unknown): value is ApmStatusFinding {
  return (
    isRecord(value) &&
    isStatusFindingCode(value.code) &&
    isStatusScope(value.scope) &&
    isStringArray(value.evidence) &&
    typeof value.reason === 'string' &&
    optionalString(value.nextAction)
  );
}

/*** Validate diagnostic evidence carried forward from status/planning adapters. */
function isStatusDiagnostic(value: unknown): value is ApmStatusDiagnostic {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    (value.severity === 'info' || value.severity === 'warning' || value.severity === 'error') &&
    isStatusScope(value.scope) &&
    isStringArray(value.evidence) &&
    typeof value.reason === 'string' &&
    optionalString(value.nextAction)
  );
}

/*** Validate shared status diagnostic scopes. */
function isStatusScope(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.kind === 'project' ||
      value.kind === 'install-root' ||
      value.kind === 'package' ||
      value.kind === 'registry' ||
      value.kind === 'projection' ||
      value.kind === 'migration' ||
      value.kind === 'host') &&
    optionalString(value.id) &&
    optionalString(value.path)
  );
}

/*** Validate the finite finding codes supported by status schema v2. */
function isStatusFindingCode(value: unknown): boolean {
  return (
    value === 'declared-changed' ||
    value === 'lock-stale' ||
    value === 'install-absent' ||
    value === 'direct-update' ||
    value === 'transitive-update' ||
    value === 'constraint-blocked' ||
    value === 'projection-stale' ||
    value === 'migration-pending' ||
    value === 'availability-unknown' ||
    value === 'host-update'
  );
}

/*** Validate plan blocker scope kinds. */
function isPlanBlockerScopeKind(value: unknown): boolean {
  return (
    value === 'project' ||
    value === 'install-root' ||
    value === 'package' ||
    value === 'migration' ||
    value === 'projection' ||
    value === 'host'
  );
}

/*** Validate package dependency section identity when present. */
function optionalDependencyKind(value: unknown): boolean {
  return (
    value === undefined ||
    value === 'dependency' ||
    value === 'development' ||
    value === 'optional' ||
    value === 'peer' ||
    value === 'peer-optional'
  );
}

/*** Validate frozen artifact source identity. */
function isArtifactSource(value: unknown): boolean {
  return value === 'registry' || value === 'workspace' || value === 'file' || value === 'git';
}

/*** Validate arrays against one type-predicate without unsafe casting. */
function isArrayOf<T>(value: unknown, predicate: (entry: unknown) => entry is T): value is readonly T[] {
  return Array.isArray(value) && value.every(predicate);
}

/*** Validate string arrays without accepting mixed serialized data. */
function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/*** Validate exact-optional strings. */
function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

/*** Validate exact-optional booleans. */
function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

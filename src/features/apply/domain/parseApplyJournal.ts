import { isRecord } from '@ankhorage/utility/object';

import type {
  ApmApplyFailure,
  ApmApplyJournal,
  ApmApplyPermissions,
  ApmApplyStepJournal,
} from '../../../types/apply.js';
import { parsePlanResult } from '../../plan/domain/parsePlanResult.js';

/*** Parse untrusted durable JSON into the canonical apply journal schema. */
export function parseApplyJournal(value: unknown): ApmApplyJournal | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1) return undefined;
  const plan = parsePlanResult(value.plan);
  if (plan === undefined) return undefined;
  if (
    typeof value.operationId !== 'string' ||
    typeof value.rootPath !== 'string' ||
    !isPermissions(value.permissions) ||
    !isJournalStatus(value.status) ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !Array.isArray(value.steps) ||
    !value.steps.every(isStepJournal) ||
    !optionalFailure(value.failure)
  ) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    operationId: value.operationId,
    rootPath: value.rootPath,
    plan,
    permissions: value.permissions,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    steps: value.steps,
    ...(value.failure === undefined ? {} : { failure: value.failure }),
  };
}

/*** Validate explicit execution consent persisted with an operation. */
function isPermissions(value: unknown): value is ApmApplyPermissions {
  return (
    isRecord(value) &&
    typeof value.ownerCode === 'boolean' &&
    typeof value.lifecycleScripts === 'boolean' &&
    typeof value.externalEffects === 'boolean'
  );
}

/*** Validate one durable step state record. */
function isStepJournal(value: unknown): value is ApmApplyStepJournal {
  return (
    isRecord(value) &&
    typeof value.stepId === 'string' &&
    isStepState(value.state) &&
    typeof value.attempts === 'number' &&
    Number.isInteger(value.attempts) &&
    value.attempts >= 0 &&
    typeof value.updatedAt === 'string' &&
    isStringArray(value.evidence) &&
    optionalFailure(value.failure)
  );
}

/*** Validate one optional durable failure payload. */
function optionalFailure(value: unknown): value is ApmApplyFailure | undefined {
  return value === undefined || isFailure(value);
}

/*** Validate durable failure evidence without trusting arbitrary nested JSON. */
function isFailure(value: unknown): value is ApmApplyFailure {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.reason === 'string' &&
    isStringArray(value.evidence) &&
    (value.nextAction === undefined || typeof value.nextAction === 'string')
  );
}

/*** Validate durable operation status. */
function isJournalStatus(value: unknown): value is ApmApplyJournal['status'] {
  return (
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled' ||
    value === 'recovery-required'
  );
}

/*** Validate durable step state. */
function isStepState(value: unknown): value is ApmApplyStepJournal['state'] {
  return (
    value === 'pending' ||
    value === 'intended' ||
    value === 'effect-started' ||
    value === 'effect-observed' ||
    value === 'committed' ||
    value === 'failed' ||
    value === 'cancelled' ||
    value === 'recovery-required'
  );
}

/*** Validate string arrays without widening mixed JSON arrays. */
function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

import { isRecord } from '@ankhorage/utility/object';

import type { ApmUpdateDescriptor } from '../../../types/update-protocol.js';
import { isApmCompatibilityConstraint } from './isApmCompatibilityConstraint.js';
import { isApmMigrationDescriptor } from './isApmMigrationDescriptor.js';
import { isApmProjectionDescriptor } from './isApmProjectionDescriptor.js';
import { isApmReleaseEffect } from './isApmReleaseEffect.js';
import { isApmUpdateHistoryDescriptor } from './isApmUpdateHistoryDescriptor.js';

/*** Parse unknown static package metadata into the canonical APM update descriptor shape. */
export function parseUpdateDescriptor(value: unknown): ApmUpdateDescriptor | undefined {
  if (!isRecord(value) || value.protocolVersion !== 1 || value.schemaVersion !== 1) return undefined;
  const owner = value.owner;
  const history = value.history;
  const compatibility = value.compatibility;
  const migrations = value.migrations;
  const projections = value.projections;
  const effects = value.effects;
  const extension = value.extension;
  if (!isOwner(owner) || !isApmUpdateHistoryDescriptor(history)) return undefined;
  if (!Array.isArray(compatibility) || !compatibility.every(isApmCompatibilityConstraint)) {
    return undefined;
  }
  if (!Array.isArray(migrations) || !migrations.every(isApmMigrationDescriptor)) return undefined;
  if (!Array.isArray(projections) || !projections.every(isApmProjectionDescriptor)) return undefined;
  if (!Array.isArray(effects) || !effects.every(isApmReleaseEffect)) return undefined;
  if (!isExtension(extension)) return undefined;
  return {
    protocolVersion: 1,
    schemaVersion: 1,
    owner,
    history,
    compatibility,
    migrations,
    projections,
    effects,
    ...(extension === undefined ? {} : { extension }),
  };
}

/*** Validate immutable owner identity fields. */
function isOwner(value: unknown): value is ApmUpdateDescriptor['owner'] {
  return isRecord(value) && typeof value.name === 'string' && typeof value.version === 'string';
}

/*** Validate the optional public extension export declaration. */
function isExtension(value: unknown): value is ApmUpdateDescriptor['extension'] | undefined {
  return value === undefined || (isRecord(value) && typeof value.export === 'string');
}

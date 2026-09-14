import { isRecord } from '@ankhorage/utility/object';

import type { ApmUpdateDescriptor } from '../../../types/update-protocol.js';
import { isApmCompatibilityConstraint } from './isApmCompatibilityConstraint.js';
import { isApmMigrationDescriptor } from './isApmMigrationDescriptor.js';
import { isApmProjectionDescriptor } from './isApmProjectionDescriptor.js';
import { isApmReleaseEffect } from './isApmReleaseEffect.js';
import { isApmUpdateHistoryDescriptor } from './isApmUpdateHistoryDescriptor.js';

/*** Parse unknown static package metadata into the canonical APM update descriptor shape. */
export function parseUpdateDescriptor(value: unknown): ApmUpdateDescriptor | undefined {
  if (!hasSupportedDescriptorHeader(value)) return undefined;
  const identity = parseDescriptorIdentity(value);
  const capabilities = parseDescriptorCapabilities(value);
  if (identity === undefined || capabilities === undefined) return undefined;
  const descriptor = {
    protocolVersion: 1,
    schemaVersion: 1,
    owner: identity.owner,
    history: identity.history,
    ...capabilities,
  } as const;
  return identity.extension === undefined
    ? descriptor
    : { ...descriptor, extension: identity.extension };
}

interface DescriptorIdentity {
  readonly owner: ApmUpdateDescriptor['owner'];
  readonly history: ApmUpdateDescriptor['history'];
  readonly extension?: ApmUpdateDescriptor['extension'];
}

interface DescriptorCapabilities {
  readonly compatibility: ApmUpdateDescriptor['compatibility'];
  readonly migrations: ApmUpdateDescriptor['migrations'];
  readonly projections: ApmUpdateDescriptor['projections'];
  readonly effects: ApmUpdateDescriptor['effects'];
}

/*** Narrow static metadata to the protocol/schema header supported by this APM release. */
function hasSupportedDescriptorHeader(
  value: unknown,
): value is Readonly<Record<string, unknown>> & { readonly protocolVersion: 1; readonly schemaVersion: 1 } {
  return isRecord(value) && value.protocolVersion === 1 && value.schemaVersion === 1;
}

/*** Parse immutable owner/history identity and the optional executable extension export. */
function parseDescriptorIdentity(
  value: Readonly<Record<string, unknown>>,
): DescriptorIdentity | undefined {
  const { owner, history, extension } = value;
  if (!isOwner(owner) || !isApmUpdateHistoryDescriptor(history) || !isExtension(extension)) {
    return undefined;
  }
  return {
    owner,
    history,
    ...(extension === undefined ? {} : { extension }),
  };
}

/*** Parse compatibility, migration, projection and shipment capability collections. */
function parseDescriptorCapabilities(
  value: Readonly<Record<string, unknown>>,
): DescriptorCapabilities | undefined {
  const { compatibility, migrations, projections, effects } = value;
  if (!isCompatibilityList(compatibility) || !isMigrationList(migrations)) return undefined;
  if (!isProjectionList(projections) || !isEffectList(effects)) return undefined;
  return { compatibility, migrations, projections, effects };
}

/*** Validate immutable owner identity fields. */
function isOwner(value: unknown): value is ApmUpdateDescriptor['owner'] {
  return isRecord(value) && typeof value.name === 'string' && typeof value.version === 'string';
}

/*** Validate the optional public extension export declaration. */
function isExtension(value: unknown): value is ApmUpdateDescriptor['extension'] | undefined {
  return value === undefined || (isRecord(value) && typeof value.export === 'string');
}

/*** Validate compatibility constraint collections. */
function isCompatibilityList(value: unknown): value is ApmUpdateDescriptor['compatibility'] {
  return Array.isArray(value) && value.every(isApmCompatibilityConstraint);
}

/*** Validate migration descriptor collections. */
function isMigrationList(value: unknown): value is ApmUpdateDescriptor['migrations'] {
  return Array.isArray(value) && value.every(isApmMigrationDescriptor);
}

/*** Validate projection descriptor collections. */
function isProjectionList(value: unknown): value is ApmUpdateDescriptor['projections'] {
  return Array.isArray(value) && value.every(isApmProjectionDescriptor);
}

/*** Validate release-effect descriptor collections. */
function isEffectList(value: unknown): value is ApmUpdateDescriptor['effects'] {
  return Array.isArray(value) && value.every(isApmReleaseEffect);
}

import { isRecord } from '@ankhorage/utility/object';

import type {
  ApmUpdateDescriptorValidationInput,
  ApmUpdateDescriptorValidationResult,
  ApmUpdateProtocolBlocker,
} from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';
import { isProtocolPackageSubpath } from '../utils/isProtocolPackageSubpath.js';
import { parseUpdateDescriptor } from './parseUpdateDescriptor.js';
import { validateCompatibilityConstraints } from './validateCompatibilityConstraints.js';
import { validateHistoryDescriptor } from './validateHistoryDescriptor.js';
import { validateMigrationDescriptors } from './validateMigrationDescriptors.js';
import { validateMigrationPrerequisites } from './validateMigrationPrerequisites.js';
import { validateProjectionDescriptors } from './validateProjectionDescriptors.js';
import { validateReleaseEffects } from './validateReleaseEffects.js';

/*** Validate unknown static package metadata and all canonical update-protocol invariants. */
export function validateUpdateDescriptor(
  input: ApmUpdateDescriptorValidationInput,
): ApmUpdateDescriptorValidationResult {
  const versionBlockers = unsupportedVersionBlockers(input.descriptor);
  if (versionBlockers.length > 0) return invalidResult(versionBlockers);
  const descriptor = parseUpdateDescriptor(input.descriptor);
  if (descriptor === undefined) return invalidResult([invalidDescriptor()]);
  const blockers = [
    ...ownerBlockers(descriptor, input.expectedOwner),
    ...extensionExportBlockers(descriptor),
    ...validateHistoryDescriptor(descriptor),
    ...validateCompatibilityConstraints(descriptor),
    ...validateMigrationDescriptors(descriptor, input.previousDescriptors),
    ...validateMigrationPrerequisites(descriptor, input.relatedDescriptors),
    ...validateProjectionDescriptors(descriptor, input.relatedDescriptors),
    ...validateReleaseEffects(descriptor),
  ];
  return { valid: blockers.length === 0, descriptor, blockers };
}

/*** Reject known-but-unsupported protocol/schema versions before structural parsing. */
function unsupportedVersionBlockers(value: unknown): readonly ApmUpdateProtocolBlocker[] {
  if (!isRecord(value)) return [];
  return [
    ...(value.protocolVersion === undefined || value.protocolVersion === 1
      ? []
      : [unsupportedVersion('protocol', value.protocolVersion)]),
    ...(value.schemaVersion === undefined || value.schemaVersion === 1
      ? []
      : [unsupportedVersion('schema', value.schemaVersion)]),
  ];
}

/*** Verify descriptor owner identity against the package artifact that supplied it. */
function ownerBlockers(
  descriptor: NonNullable<ApmUpdateDescriptorValidationResult['descriptor']>,
  expected: ApmUpdateDescriptorValidationInput['expectedOwner'],
): readonly ApmUpdateProtocolBlocker[] {
  if (expected === undefined) return [];
  return descriptor.owner.name === expected.name && descriptor.owner.version === expected.version
    ? []
    : [
        createProtocolBlocker({
          code: 'protocol.owner-mismatch',
          kind: 'descriptor',
          evidence: [
            `${descriptor.owner.name}@${descriptor.owner.version}`,
            `${expected.name}@${expected.version}`,
          ],
          reason: 'Descriptor owner identity does not match the package artifact that supplied it.',
        }),
      ];
}

/*** Require executable extension exports to remain inside the package public subpath namespace. */
function extensionExportBlockers(
  descriptor: NonNullable<ApmUpdateDescriptorValidationResult['descriptor']>,
): readonly ApmUpdateProtocolBlocker[] {
  const extensionExport = descriptor.extension?.export;
  return extensionExport === undefined || isProtocolPackageSubpath(extensionExport)
    ? []
    : [
        createProtocolBlocker({
          code: 'protocol.invalid-extension-export',
          kind: 'extension',
          evidence: [extensionExport],
          reason: 'Extension export must be a traversal-free package-relative `./…` subpath.',
        }),
      ];
}

/*** Build one unsupported protocol/schema version blocker without unsafe coercion. */
function unsupportedVersion(
  subject: 'protocol' | 'schema',
  value: unknown,
): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: subject === 'protocol' ? 'protocol.unsupported-version' : 'protocol.unsupported-schema',
    kind: 'descriptor',
    evidence: [primitiveEvidence(value)],
    reason: `APM does not support this ${subject} version.`,
  });
}

/*** Render primitive version evidence without relying on Object default stringification. */
function primitiveEvidence(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return value === null ? 'null' : typeof value;
}

/*** Build the generic malformed-descriptor blocker after supported-version checks pass. */
function invalidDescriptor(): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.invalid-descriptor',
    kind: 'descriptor',
    evidence: [],
    reason: 'Static update metadata does not match the canonical APM descriptor shape.',
  });
}

/*** Return validation failure before a typed descriptor can be exposed. */
function invalidResult(
  blockers: readonly ApmUpdateProtocolBlocker[],
): ApmUpdateDescriptorValidationResult {
  return { valid: false, blockers };
}

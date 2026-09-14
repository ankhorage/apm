import { isRecord } from '@ankhorage/utility/object';

import type { ApmPackageUpdateMetadataValidationResult } from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';
import { isProtocolPackageSubpath } from '../utils/isProtocolPackageSubpath.js';

/*** Validate package.json `ankhorage.apm` discovery metadata before descriptor loading. */
export function validatePackageUpdateMetadata(
  value: unknown,
): ApmPackageUpdateMetadataValidationResult {
  if (!isRecord(value)) return invalidMetadata('APM package update metadata must be an object.');
  const { protocolVersion, descriptor } = value;
  if (protocolVersion !== 1) {
    return {
      valid: false,
      blockers: [
        createProtocolBlocker({
          code: 'protocol.unsupported-version',
          kind: 'package-metadata',
          evidence: [primitiveEvidence(protocolVersion)],
          reason: 'Package update metadata uses an unsupported APM protocol version.',
        }),
      ],
    };
  }
  if (typeof descriptor !== 'string') {
    return invalidMetadata('Package update metadata must declare a descriptor subpath.');
  }
  if (!isProtocolPackageSubpath(descriptor)) {
    return {
      valid: false,
      blockers: [
        createProtocolBlocker({
          code: 'protocol.invalid-descriptor-path',
          kind: 'package-metadata',
          evidence: [descriptor],
          reason: 'Descriptor path must be a traversal-free package-relative `./…` subpath.',
        }),
      ],
    };
  }
  return { valid: true, metadata: { protocolVersion: 1, descriptor }, blockers: [] };
}

/*** Build malformed package discovery metadata evidence. */
function invalidMetadata(reason: string): ApmPackageUpdateMetadataValidationResult {
  return {
    valid: false,
    blockers: [
      createProtocolBlocker({
        code: 'protocol.invalid-package-metadata',
        kind: 'package-metadata',
        evidence: [],
        reason,
      }),
    ],
  };
}

/*** Render primitive discovery metadata evidence without Object default stringification. */
function primitiveEvidence(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return value === null ? 'null' : typeof value;
}

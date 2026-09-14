import { isRecord } from '@ankhorage/utility/object';

import type { ApmExtensionArtifactIdentity } from '../../../types/update-extension.js';
import type { ApmUpdateProtocolBlocker } from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';
import { isApmUpdateExtension } from './isApmUpdateExtension.js';

/*** Validate loaded owner code against the exact immutable artifact identity selected by APM. */
export function validateUpdateExtensionBinding(
  artifact: ApmExtensionArtifactIdentity,
  extension: unknown,
): readonly ApmUpdateProtocolBlocker[] {
  const artifactBlockers = artifactIdentityBlockers(artifact);
  if (artifactBlockers.length > 0) return artifactBlockers;
  const protocolBlockers = extensionProtocolBlockers(extension);
  if (protocolBlockers.length > 0) return protocolBlockers;
  if (!isApmUpdateExtension(extension)) return [invalidExtensionShape()];
  return extension.descriptorDigest === artifact.descriptorDigest
    ? []
    : [bindingMismatch('descriptor digest', extension.descriptorDigest, artifact.descriptorDigest)];
}

/*** Require registry/package-manager integrity and descriptor digest before executable code loads. */
function artifactIdentityBlockers(
  artifact: ApmExtensionArtifactIdentity,
): readonly ApmUpdateProtocolBlocker[] {
  if (artifact.integrity.trim() === '') {
    return [
      createProtocolBlocker({
        code: 'protocol.artifact-integrity-required',
        kind: 'extension',
        evidence: [`${artifact.packageName}@${artifact.version}`],
        reason: 'Executable owner code requires immutable package artifact integrity evidence.',
      }),
    ];
  }
  return artifact.descriptorDigest.trim() === ''
    ? [bindingMismatch('descriptor digest', artifact.descriptorDigest, 'non-empty digest')]
    : [];
}

/*** Reject missing or incompatible runtime protocol values before executable shape validation. */
function extensionProtocolBlockers(extension: unknown): readonly ApmUpdateProtocolBlocker[] {
  if (!isRecord(extension)) return [];
  const { protocolVersion } = extension;
  return protocolVersion === 1
    ? []
    : [bindingMismatch('protocol version', primitiveEvidence(protocolVersion), '1')];
}

/*** Render runtime protocol evidence without Object default stringification. */
function primitiveEvidence(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return value === null ? 'null' : typeof value;
}

/*** Build an extension binding mismatch blocker. */
function bindingMismatch(
  subject: string,
  actual: string,
  expected: string,
): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.extension-binding-mismatch',
    kind: 'extension',
    evidence: [actual, expected],
    reason: `Extension ${subject} does not match the frozen artifact identity.`,
  });
}

/*** Reject loaded runtime values that do not implement the executable extension contract. */
function invalidExtensionShape(): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.extension-binding-mismatch',
    kind: 'extension',
    evidence: [],
    reason: 'Loaded owner code does not implement the APM update extension contract.',
  });
}

import type { ApmUpdateExtension } from '../../../types/update-extension.js';
import type { ApmUpdateDescriptor } from '../../../types/update-protocol.js';
import type { ApmUpdateProtocolBlocker } from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';

/*** Validate that trusted executable owner code implements the exact frozen static descriptor. */
export function validateUpdateExtensionBinding(
  descriptor: ApmUpdateDescriptor,
  descriptorDigest: string,
  extension: ApmUpdateExtension,
): readonly ApmUpdateProtocolBlocker[] {
  return [
    ...(extension.protocolVersion === descriptor.protocolVersion
      ? []
      : [bindingMismatch('protocol version', String(extension.protocolVersion), String(descriptor.protocolVersion))]),
    ...(extension.descriptorDigest === descriptorDigest
      ? []
      : [bindingMismatch('descriptor digest', extension.descriptorDigest, descriptorDigest)]),
    ...migrationHandlerBlockers(descriptor, extension),
    ...projectionHandlerBlockers(descriptor, extension),
  ];
}

/*** Require migration handler IDs to match the descriptor exactly. */
function migrationHandlerBlockers(
  descriptor: ApmUpdateDescriptor,
  extension: ApmUpdateExtension,
): readonly ApmUpdateProtocolBlocker[] {
  return idSetBlockers(
    'migration',
    descriptor.migrations.map((migration) => migration.id),
    extension.migrations.map((handler) => handler.id),
  );
}

/*** Require handlers for every executable projection and reject undeclared projection handlers. */
function projectionHandlerBlockers(
  descriptor: ApmUpdateDescriptor,
  extension: ApmUpdateExtension,
): readonly ApmUpdateProtocolBlocker[] {
  const required = descriptor.projections
    .filter((projection) => projection.requiresExtension)
    .map((projection) => projection.id);
  const declared = descriptor.projections.map((projection) => projection.id);
  const actual = extension.projections.map((handler) => handler.id);
  return [
    ...required.flatMap((id) => (actual.includes(id) ? [] : [missingHandler('projection', id)])),
    ...actual.flatMap((id) => (declared.includes(id) ? [] : [unexpectedHandler('projection', id)])),
  ];
}

/*** Compare one descriptor handler-ID set against the extension's actual handlers. */
function idSetBlockers(
  kind: 'migration' | 'projection',
  expected: readonly string[],
  actual: readonly string[],
): readonly ApmUpdateProtocolBlocker[] {
  return [
    ...expected.flatMap((id) => (actual.includes(id) ? [] : [missingHandler(kind, id)])),
    ...actual.flatMap((id) => (expected.includes(id) ? [] : [unexpectedHandler(kind, id)])),
  ];
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
    reason: `Extension ${subject} does not match the frozen static descriptor.`,
  });
}

/*** Build evidence for one descriptor capability lacking executable code. */
function missingHandler(kind: string, id: string): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.extension-binding-mismatch',
    kind: 'extension',
    id,
    evidence: [kind, id],
    reason: `Descriptor ${kind} ${id} has no matching extension handler.`,
  });
}

/*** Build evidence for executable code that has no static descriptor identity. */
function unexpectedHandler(kind: string, id: string): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.extension-binding-mismatch',
    kind: 'extension',
    id,
    evidence: [kind, id],
    reason: `Extension ${kind} ${id} is not declared by the frozen static descriptor.`,
  });
}

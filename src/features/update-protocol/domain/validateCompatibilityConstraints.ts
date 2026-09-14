import { validRange } from 'semver';

import type { ApmUpdateDescriptor } from '../../../types/update-protocol.js';
import type { ApmUpdateProtocolBlocker } from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';

/*** Validate semantic-version ranges declared by owner compatibility constraints. */
export function validateCompatibilityConstraints(
  descriptor: ApmUpdateDescriptor,
): readonly ApmUpdateProtocolBlocker[] {
  return descriptor.compatibility.flatMap((constraint) =>
    validRange(constraint.range) === null
      ? [
          createProtocolBlocker({
            code: 'protocol.invalid-version-range',
            kind: 'descriptor',
            id: `${constraint.kind}:${constraint.name}`,
            evidence: [constraint.range],
            reason: `Compatibility range ${constraint.range} is not valid semantic-version syntax.`,
          }),
        ]
      : [],
  );
}

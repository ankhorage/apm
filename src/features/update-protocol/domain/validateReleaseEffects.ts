import type { ApmUpdateDescriptor } from '../../../types/update-protocol.js';
import type { ApmUpdateProtocolBlocker } from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';

/*** Require concrete platform evidence before an owner can claim OTA eligibility. */
export function validateReleaseEffects(
  descriptor: ApmUpdateDescriptor,
): readonly ApmUpdateProtocolBlocker[] {
  return descriptor.effects.flatMap((effect) =>
    effect.kind === 'ota-eligibility' && effect.eligibility === 'eligible' && effect.evidence.length === 0
      ? [
          createProtocolBlocker({
            code: 'protocol.ota-evidence-required',
            kind: 'effect',
            id: effect.kind,
            evidence: [],
            reason: 'OTA eligibility cannot be claimed without explicit platform evidence.',
            nextAction: 'Provide the platform evidence proving this update is OTA-safe.',
          }),
        ]
      : [],
  );
}

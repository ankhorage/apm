import type {
  ApmUpdateProtocolBlocker,
  ApmUpdateProtocolBlockerCode,
} from '../../../types/update-validation.js';

/*** Build one immutable structured protocol blocker for domain validation. */
export function createProtocolBlocker(input: {
  readonly code: ApmUpdateProtocolBlockerCode;
  readonly kind: ApmUpdateProtocolBlocker['scope']['kind'];
  readonly id?: string;
  readonly evidence: readonly string[];
  readonly reason: string;
  readonly nextAction?: string;
}): ApmUpdateProtocolBlocker {
  return {
    code: input.code,
    scope: {
      kind: input.kind,
      ...(input.id === undefined ? {} : { id: input.id }),
    },
    evidence: input.evidence,
    reason: input.reason,
    ...(input.nextAction === undefined ? {} : { nextAction: input.nextAction }),
  };
}

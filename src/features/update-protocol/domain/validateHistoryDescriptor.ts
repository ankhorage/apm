import { intersects, valid, validRange } from 'semver';

import type { ApmUpdateDescriptor } from '../../../types/update-protocol.js';
import type { ApmUpdateProtocolBlocker } from '../../../types/update-validation.js';
import { createProtocolBlocker } from '../utils/createProtocolBlocker.js';

/*** Validate supported/unsupported owner history and semantic-version syntax. */
export function validateHistoryDescriptor(
  descriptor: ApmUpdateDescriptor,
): readonly ApmUpdateProtocolBlocker[] {
  const invalidRanges = [
    ...descriptor.history.supported.flatMap((entry) =>
      validRange(entry.sourceRange) === null ? [invalidHistoryRange(entry.sourceRange)] : [],
    ),
    ...descriptor.history.unsupported.flatMap((entry) =>
      validRange(entry.sourceRange) === null ? [invalidHistoryRange(entry.sourceRange)] : [],
    ),
  ];
  const ownerVersion =
    valid(descriptor.owner.version) === null ? [invalidOwnerVersion(descriptor.owner.version)] : [];
  return [
    ...ownerVersion,
    ...invalidRanges,
    ...supportedHistoryOverlaps(descriptor),
    ...supportedUnsupportedOverlaps(descriptor),
  ];
}

/*** Report one malformed history range. */
function invalidHistoryRange(range: string): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.invalid-version-range',
    kind: 'history',
    evidence: [range],
    reason: `Source history range ${range} is not valid semantic-version syntax.`,
  });
}

/*** Report an owner package version that cannot participate in deterministic migration paths. */
function invalidOwnerVersion(version: string): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.invalid-version-range',
    kind: 'descriptor',
    evidence: [version],
    reason: `Owner package version ${version} is not an exact semantic version.`,
  });
}

/*** Detect ambiguous overlapping supported history entries with the same state selector. */
function supportedHistoryOverlaps(
  descriptor: ApmUpdateDescriptor,
): readonly ApmUpdateProtocolBlocker[] {
  return descriptor.history.supported.flatMap((entry, index, entries) =>
    entries
      .slice(index + 1)
      .flatMap((other) =>
        sameStateSelector(entry.stateRevision, other.stateRevision) &&
        rangesIntersect(entry.sourceRange, other.sourceRange)
          ? [historyOverlap(entry.sourceRange, other.sourceRange)]
          : [],
      ),
  );
}

/*** Detect source versions declared both supported and explicitly unsupported. */
function supportedUnsupportedOverlaps(
  descriptor: ApmUpdateDescriptor,
): readonly ApmUpdateProtocolBlocker[] {
  return descriptor.history.supported.flatMap((supported) =>
    descriptor.history.unsupported.flatMap((unsupported) =>
      rangesIntersect(supported.sourceRange, unsupported.sourceRange)
        ? [historyOverlap(supported.sourceRange, unsupported.sourceRange)]
        : [],
    ),
  );
}

/*** Compare optional state selectors without widening undefined semantics. */
function sameStateSelector(left: string | undefined, right: string | undefined): boolean {
  return left === right;
}

/*** Test two validated semantic-version ranges for intersection. */
function rangesIntersect(left: string, right: string): boolean {
  return validRange(left) !== null && validRange(right) !== null && intersects(left, right);
}

/*** Build one history overlap blocker. */
function historyOverlap(left: string, right: string): ApmUpdateProtocolBlocker {
  return createProtocolBlocker({
    code: 'protocol.history-overlap',
    kind: 'history',
    evidence: [left, right],
    reason: 'Source history declarations overlap and would make update support ambiguous.',
    nextAction: 'Make supported and unsupported source ranges mutually exclusive.',
  });
}

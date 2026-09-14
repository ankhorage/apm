import { createHash } from 'node:crypto';

import type { ApmPlanDigestPort } from '../../../../types/plan.js';

/*** Create the Node SHA-256 digest adapter used for semantic input fingerprints and plan IDs. */
export function createSha256PlanDigestPort(): ApmPlanDigestPort {
  return {
    digestAsync: (value) => Promise.resolve(createHash('sha256').update(value).digest('hex')),
  };
}

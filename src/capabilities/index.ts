import type { Capability } from '@ankhorage/contracts/capability';

/*** Publish the canonical catalog for executable APM operations. */
export const CAPABILITIES = [
  {
    id: 'apm.status',
    owner: '@ankhorage/apm',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Inspect project update status',
    description:
      'Inspect dependency, installation, projection, migration and availability evidence.',
  },
  {
    id: 'apm.plan',
    owner: '@ankhorage/apm',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Plan project updates',
    description: 'Resolve a concrete reviewable update plan without mutating the project.',
  },
  {
    id: 'apm.apply',
    owner: '@ankhorage/apm',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Apply project updates',
    description: 'Apply a selected still-valid update plan with recovery semantics.',
  },
  {
    id: 'apm.verify',
    owner: '@ankhorage/apm',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Verify project updates',
    description:
      'Verify the applied dependency graph, migrations, projections, and required checks.',
  },
] as const satisfies readonly Capability[];

import type { ApmPlanStepExecution } from '../../../../types/plan-execution.js';
import type {
  ApmMigrationDescriptor,
  ApmProjectionDescriptor,
} from '../../../../types/update-protocol.js';

/*** Build reusable executable migration/projection evidence for plan behavior fixtures. */
export const planExecutionFixtures = {
  migration: (
    descriptor: ApmMigrationDescriptor,
  ): Extract<ApmPlanStepExecution, { readonly kind: 'migration' }> => ({
    kind: 'migration',
    descriptor,
    artifact: {
      role: descriptor.implementation.artifact,
      packageName: '@owner/package',
      version: descriptor.implementation.version ?? descriptor.to.packageVersion,
      integrity: `sha512:${descriptor.to.packageVersion}`,
      descriptorDigest: 'sha256:owner-update-descriptor',
    },
    plan: {
      migrationId: descriptor.id,
      mutations: [],
      evidence: [descriptor.checksum],
      inputFingerprint: `migration-input:${descriptor.id}`,
    },
  }),
  projection: (
    input: ProjectionFixtureInput,
  ): Extract<ApmPlanStepExecution, { readonly kind: 'projection' }> => {
    const claim = { kind: 'file' as const, path: input.path };
    const descriptor: ApmProjectionDescriptor = {
      id: input.projectionId,
      claims: [claim],
      requiresExtension: true,
    };
    return {
      kind: 'projection',
      descriptor,
      artifact: {
        role: 'target',
        packageName: '@owner/package',
        version: input.version ?? '2.0.0',
        integrity: `sha512:${input.version ?? '2.0.0'}`,
        descriptorDigest: 'sha256:owner-update-descriptor',
      },
      plan: {
        projectionId: input.projectionId,
        mutations: [
          {
            id: `projection:${input.projectionId}:write`,
            claim,
            kind: 'write-file',
            path: input.path,
            encoding: 'utf8',
            content: input.content,
            expectedBeforeDigest: input.beforeDigest,
            afterDigest: input.afterDigest,
          },
        ],
        inputFingerprint: `projection-input:${input.projectionId}`,
        generatorFingerprint: input.generatorFingerprint,
        evidence: [input.path],
      },
    };
  },
} as const;

interface ProjectionFixtureInput {
  readonly projectionId: string;
  readonly path: string;
  readonly content: string;
  readonly beforeDigest: string;
  readonly afterDigest: string;
  readonly generatorFingerprint: string;
  readonly version?: string;
}

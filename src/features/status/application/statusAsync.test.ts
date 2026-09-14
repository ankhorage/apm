import type { ProjectInspection } from '@ankhorage/project-detector/types';
import { describe, expect, test } from 'bun:test';

import type {
  ApmAvailabilityEvidence,
  ApmDependencyInventory,
  ApmExtensionEvidence,
  ApmStatusPorts,
} from '../../../types/status.js';
import { statusAsync } from './statusAsync.js';

const inspection: ProjectInspection = {
  rootPath: '/fixture',
  complete: true,
  detection: {
    traits: new Set(['typescript', 'node']),
    languages: [{ id: 'typescript', score: 10, evidence: ['package.json'], sourceRoots: ['src'] }],
    packageManagers: ['npm'],
    buildTools: [],
    findings: [],
    diagnostics: [],
  },
  packages: [],
  workspaces: [],
  manifests: ['package.json'],
  diagnostics: [],
};

const inventory: ApmDependencyInventory = {
  complete: true,
  diagnostics: [],
  roots: [
    {
      id: '.',
      rootPath: '/fixture',
      packagePaths: ['.'],
      manager: {
        state: 'selected',
        name: 'npm',
        version: '12.0.2',
        source: 'package-manager-field',
      },
      lockfile: {
        state: 'supported',
        path: 'package-lock.json',
        format: 'npm-package-lock',
        version: '3',
        evidence: ['package-lock.json'],
      },
      declarations: [
        {
          ownerPath: 'package.json',
          name: 'direct',
          range: '^2.0.0',
          kind: 'dependency',
          resolvedPackageId: 'node_modules/direct',
        },
      ],
      lockedPackages: [
        {
          id: 'node_modules/direct',
          name: 'direct',
          version: '1.0.0',
          source: 'registry',
          optional: false,
          dependencies: [
            { name: 'transitive', requested: '^1.0.0', packageId: 'node_modules/transitive' },
          ],
        },
        {
          id: 'node_modules/transitive',
          name: 'transitive',
          version: '1.0.0',
          source: 'registry',
          optional: false,
          dependencies: [],
        },
        {
          id: 'node_modules/missing',
          name: 'missing',
          version: '1.0.0',
          source: 'registry',
          optional: false,
          dependencies: [],
        },
      ],
      installedPackages: [
        {
          packageId: 'node_modules/direct',
          state: 'present',
          source: 'node-modules',
          version: '1.0.0',
        },
        {
          packageId: 'node_modules/transitive',
          state: 'present',
          source: 'node-modules',
          version: '1.0.0',
        },
        {
          packageId: 'node_modules/missing',
          state: 'absent',
          source: 'node-modules',
          reason: 'package directory missing',
        },
      ],
      complete: true,
      diagnostics: [],
    },
  ],
};

const availability: ApmAvailabilityEvidence = {
  complete: true,
  diagnostics: [],
  packages: [
    {
      packageId: '.::node_modules/direct',
      name: 'direct',
      state: 'known',
      latestVersion: '3.0.0',
      compatibleVersion: '2.5.0',
    },
    {
      packageId: '.::node_modules/transitive',
      name: 'transitive',
      state: 'known',
      latestVersion: '1.1.0',
      compatibleVersion: '1.1.0',
    },
    {
      packageId: '.::node_modules/missing',
      name: 'missing',
      state: 'known',
      latestVersion: '1.0.0',
      compatibleVersion: '1.0.0',
    },
  ],
};

const extensions: ApmExtensionEvidence = {
  state: 'available',
  complete: true,
  observations: [
    {
      packageId: '.::node_modules/direct',
      projection: 'stale',
      migration: 'pending',
      evidence: ['generated projection differs'],
    },
  ],
  diagnostics: [],
};

describe('statusAsync', () => {
  test('distinguishes declaration, lock, installation, transitive, projection, and migration drift', async () => {
    const result = await statusAsync(
      { rootPath: '/fixture' },
      createPorts({ inventory, availability, extensions }),
    );
    const codes = result.findings.map((finding) => finding.code);

    expect(result.currency).toBe('outdated');
    expect(result.complete).toBe(true);
    expect(codes).toContain('declared-changed');
    expect(codes).toContain('lock-stale');
    expect(codes).toContain('install-absent');
    expect(codes).toContain('transitive-update');
    expect(codes).toContain('projection-stale');
    expect(codes).toContain('migration-pending');
    expect(
      result.dependencies.find((dependency) => dependency.name === 'transitive')?.dependencyPaths,
    ).toEqual([['.::node_modules/direct', '.::node_modules/transitive']]);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  test('never reports current when registry availability is unknown', async () => {
    const unknownAvailability: ApmAvailabilityEvidence = {
      complete: false,
      diagnostics: [],
      packages: inventory.roots[0]!.lockedPackages.map((pkg) => ({
        packageId: `.::${pkg.id}`,
        name: pkg.name,
        state: 'unknown' as const,
        reason: 'offline cache miss',
      })),
    };
    const result = await statusAsync(
      { rootPath: '/fixture', availability: 'offline' },
      createPorts({
        inventory,
        availability: unknownAvailability,
        extensions: { ...extensions, observations: [] },
      }),
    );

    expect(result.complete).toBe(false);
    expect(result.currency).toBe('unknown');
    expect(result.findings.map((finding) => finding.code)).toContain('availability-unknown');
  });

  test('never reports current when Project Detector inspection is truncated', async () => {
    const result = await statusAsync(
      { rootPath: '/fixture' },
      createPorts({
        inspection: {
          ...inspection,
          complete: false,
          diagnostics: [{ code: 'entry-budget', message: 'truncated' }],
        },
        inventory,
        availability,
        extensions: { ...extensions, observations: [] },
      }),
    );

    expect(result.complete).toBe(false);
    expect(result.currency).toBe('unknown');
    expect(result.diagnostics[0]?.code).toBe('project-detector.entry-budget');
  });

  test('keeps host updates separate from application dependency updates', async () => {
    const hostAvailability: ApmAvailabilityEvidence = {
      ...availability,
      packages: [
        ...availability.packages,
        {
          packageId: 'host:apm',
          name: '@ankhorage/apm',
          state: 'known',
          latestVersion: '0.2.0',
          compatibleVersion: '0.2.0',
        },
      ],
    };
    const result = await statusAsync(
      {
        rootPath: '/fixture',
        hostPackages: [{ id: 'apm', name: '@ankhorage/apm', version: '0.1.0' }],
      },
      createPorts({
        inventory,
        availability: hostAvailability,
        extensions: { ...extensions, observations: [] },
      }),
    );

    expect(result.hosts[0]?.findings.map((finding) => finding.code)).toContain('host-update');
  });
});

/*** Build deterministic fake outbound ports for status behavior tests. */
function createPorts(input: {
  readonly inspection?: ProjectInspection;
  readonly inventory: ApmDependencyInventory;
  readonly availability: ApmAvailabilityEvidence;
  readonly extensions: ApmExtensionEvidence;
}): ApmStatusPorts {
  return {
    projectInspection: {
      inspectProjectAsync: () => Promise.resolve(input.inspection ?? inspection),
    },
    dependencyInventory: {
      inspectDependencyInventoryAsync: () => Promise.resolve(input.inventory),
    },
    availability: {
      queryAvailabilityAsync: () => Promise.resolve(input.availability),
    },
    extensions: {
      inspectExtensionEvidenceAsync: () => Promise.resolve(input.extensions),
    },
  };
}

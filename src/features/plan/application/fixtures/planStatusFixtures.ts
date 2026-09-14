import type { ApmStatusDependency, ApmStatusResult } from '../../../../types/status.js';

/*** Build one complete npm install-root snapshot around an already defined dependency fixture. */
export function createNpmInstallRootFixture(
  dependency: ApmStatusDependency,
  options: NpmInstallRootFixtureOptions = {},
): ApmStatusResult['installRoots'][number] {
  const { declaration } = dependency;
  return {
    id: options.id ?? 'root',
    rootPath: options.rootPath ?? '/project',
    packagePaths: options.packagePaths ?? ['/project'],
    manager: {
      state: 'selected',
      name: 'npm',
      version: options.managerVersion ?? '11.0.0',
      source: 'package-manager-field',
    },
    lockfile: {
      state: 'supported',
      path: options.lockPath ?? '/project/package-lock.json',
      format: options.lockFormat ?? 'npm-package-lock',
      version: '3',
      evidence: options.lockEvidence ?? ['package-lock.json'],
    },
    declarations: declaration === undefined ? [] : [declaration],
    lockedPackages: [
      {
        id: dependency.packageId,
        name: dependency.name,
        ...(dependency.lockedVersion === undefined ? {} : { version: dependency.lockedVersion }),
        source: 'registry',
        optional: false,
        dependencies: [],
      },
    ],
    installedPackages: [dependency.installed],
    complete: true,
    diagnostics: [],
  };
}

interface NpmInstallRootFixtureOptions {
  readonly id?: string;
  readonly rootPath?: string;
  readonly packagePaths?: readonly string[];
  readonly managerVersion?: string;
  readonly lockPath?: string;
  readonly lockFormat?: string;
  readonly lockEvidence?: readonly string[];
}

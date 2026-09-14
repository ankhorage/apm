import type {
  ApmInstalledPackageEvidence,
  ApmLockedPackageEvidence,
  ApmLockfileEvidence,
  ApmPackageManagerEvidence,
  ApmStatusDiagnostic,
} from './status.js';

export interface ApmParsedPackageManifest {
  readonly packageRoot: string;
  readonly manifestPath: string;
  readonly name?: string;
  readonly packageManager?: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly optionalDependencies: Readonly<Record<string, string>>;
  readonly peerDependencies: Readonly<Record<string, string>>;
  readonly optionalPeers: ReadonlySet<string>;
}

export interface ApmDiscoveredInstallRoot {
  readonly id: string;
  readonly rootPath: string;
  readonly manager: ApmPackageManagerEvidence;
  readonly lockfileCandidates: readonly ApmLockfileCandidate[];
  readonly manifests: readonly ApmParsedPackageManifest[];
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

export interface ApmLockfileCandidate {
  readonly manager: 'npm' | 'pnpm' | 'yarn' | 'bun';
  readonly fileName: string;
  readonly path: string;
}

export interface ApmManagerInspectionResult {
  readonly linker?: string;
  readonly lockfile: ApmLockfileEvidence;
  readonly lockedPackages: readonly ApmLockedPackageEvidence[];
  readonly installedPackages: readonly ApmInstalledPackageEvidence[];
  readonly directResolutions: ReadonlyMap<string, string>;
  readonly complete: boolean;
  readonly diagnostics: readonly ApmStatusDiagnostic[];
}

export interface ApmManagerInspectionInput {
  readonly root: ApmDiscoveredInstallRoot;
}

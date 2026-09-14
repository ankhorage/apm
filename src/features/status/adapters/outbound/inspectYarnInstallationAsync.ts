import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { pathExists } from '@ankhorage/utility/node/fs';
import { isRecord } from '@ankhorage/utility/object';
import { parse as parseYaml } from 'yaml';

import type {
  ApmManagerInspectionInput,
  ApmManagerInstallationEvidence,
} from '../../../../types/status-inventory.js';
import type { ApmInstalledPackageEvidence, ApmLockedPackageEvidence } from '../../../../types/status.js';

/*** Inspect Yarn installation markers without importing or executing `.pnp.cjs`. */
export async function inspectYarnInstallationAsync(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): Promise<ApmManagerInstallationEvidence> {
  const linker = await readYarnLinkerAsync(input.root.rootPath);
  if (linker === 'pnp') return inspectYarnPnpAsync(input, packages);
  if (linker === 'node-modules') return inspectYarnNodeModulesAsync(input, packages);
  return unsupportedLinker(input.root.id, linker, packages);
}

/*** Read Yarn nodeLinker as data; modern Yarn defaults to PnP. */
async function readYarnLinkerAsync(rootPath: string): Promise<string> {
  const yarnrc = path.join(rootPath, '.yarnrc.yml');
  if (!(await pathExists(yarnrc))) return 'pnp';
  const parsed = parseYaml(await readFile(yarnrc, 'utf8')) as unknown;
  return isRecord(parsed) && typeof parsed.nodeLinker === 'string' ? parsed.nodeLinker : 'pnp';
}

/*** Parse non-executable `.pnp.data.json`, or report inlined executable PnP state as unknown. */
async function inspectYarnPnpAsync(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): Promise<ApmManagerInstallationEvidence> {
  const dataPath = path.join(input.root.rootPath, '.pnp.data.json');
  if (await pathExists(dataPath)) {
    const locators = readPnpLocators(JSON.parse(await readFile(dataPath, 'utf8')) as unknown);
    return {
      linker: 'pnp',
      installedPackages: packages.map((pkg) => locatorInstallation(pkg, locators)),
      complete: true,
      diagnostics: [],
    };
  }
  const cjsPath = path.join(input.root.rootPath, '.pnp.cjs');
  if (await pathExists(cjsPath)) return inlinedPnpEvidence(input.root.id, packages);
  return {
    linker: 'pnp',
    installedPackages: packages.map((pkg) => ({
      packageId: pkg.id,
      state: 'absent',
      source: 'pnp-data',
      reason: 'No Yarn PnP installation marker exists.',
    })),
    complete: true,
    diagnostics: [],
  };
}

interface PnpLocator {
  readonly name: string;
  readonly reference: string;
}

/*** Extract package ident/reference pairs from Yarn's non-executable PnP data table. */
function readPnpLocators(value: unknown): readonly PnpLocator[] {
  if (!isRecord(value) || !Array.isArray(value.packageRegistryData)) return [];
  return value.packageRegistryData.flatMap((identEntry) => {
    if (!Array.isArray(identEntry) || typeof identEntry[0] !== 'string' || !Array.isArray(identEntry[1])) {
      return [];
    }
    return identEntry[1].flatMap((referenceEntry) =>
      Array.isArray(referenceEntry) && typeof referenceEntry[0] === 'string'
        ? [{ name: identEntry[0], reference: referenceEntry[0] }]
        : [],
    );
  });
}

/*** Convert one PnP locator match into installed/absent package evidence. */
function locatorInstallation(
  pkg: ApmLockedPackageEvidence,
  locators: readonly PnpLocator[],
): ApmInstalledPackageEvidence {
  const present = locators.some(
    (locator) =>
      locator.name === pkg.name &&
      (pkg.version === undefined || locator.reference.includes(pkg.version)),
  );
  return present
    ? {
        packageId: pkg.id,
        state: 'present',
        source: 'pnp-data',
        ...(pkg.version === undefined ? {} : { version: pkg.version }),
        location: '.pnp.data.json',
      }
    : {
        packageId: pkg.id,
        state: 'absent',
        source: 'pnp-data',
        reason: 'Package locator is absent from .pnp.data.json.',
      };
}

/*** Read Yarn's node-modules state file as locator evidence rather than crawling package code. */
async function inspectYarnNodeModulesAsync(
  input: ApmManagerInspectionInput,
  packages: readonly ApmLockedPackageEvidence[],
): Promise<ApmManagerInstallationEvidence> {
  const nodeModules = path.join(input.root.rootPath, 'node_modules');
  if (!(await pathExists(nodeModules))) return absentNodeModules(packages);
  const statePath = path.join(nodeModules, '.yarn-state.yml');
  if (!(await pathExists(statePath))) return missingYarnState(input.root.id, packages);
  const state = parseYaml(await readFile(statePath, 'utf8')) as unknown;
  const locatorKeys = isRecord(state)
    ? Object.keys(state).filter((key) => key !== '__metadata')
    : [];
  return {
    linker: 'node-modules',
    installedPackages: packages.map((pkg) => yarnStateInstallation(pkg, locatorKeys)),
    complete: true,
    diagnostics: [],
  };
}

/*** Match one lock instance against Yarn node-modules state locators. */
function yarnStateInstallation(
  pkg: ApmLockedPackageEvidence,
  locatorKeys: readonly string[],
): ApmInstalledPackageEvidence {
  const present = locatorKeys.some(
    (key) => key.includes(`${pkg.name}@`) && (pkg.version === undefined || key.includes(pkg.version)),
  );
  return present
    ? {
        packageId: pkg.id,
        state: 'present',
        source: 'yarn-state',
        ...(pkg.version === undefined ? {} : { version: pkg.version }),
        location: 'node_modules/.yarn-state.yml',
      }
    : {
        packageId: pkg.id,
        state: 'absent',
        source: 'yarn-state',
        reason: 'Package locator is absent from .yarn-state.yml.',
      };
}

/*** Refuse to execute inlined PnP JavaScript just to obtain installation state. */
function inlinedPnpEvidence(
  rootId: string,
  packages: readonly ApmLockedPackageEvidence[],
): ApmManagerInstallationEvidence {
  return {
    linker: 'pnp',
    installedPackages: packages.map((pkg) => unknownInstall(pkg.id, 'Yarn PnP data is inlined in executable .pnp.cjs.')),
    complete: false,
    diagnostics: [{
      code: 'status.install.yarn.pnp-inlined',
      severity: 'warning',
      scope: { kind: 'install-root', id: rootId },
      evidence: ['.pnp.cjs'],
      reason: 'Yarn PnP installation exists, but its dependency map is executable JavaScript.',
      nextAction: 'Set pnpEnableInlining: false to expose read-only .pnp.data.json evidence.',
    }],
  };
}

/*** Represent absent node_modules as complete absence evidence. */
function absentNodeModules(
  packages: readonly ApmLockedPackageEvidence[],
): ApmManagerInstallationEvidence {
  return {
    linker: 'node-modules',
    installedPackages: packages.map((pkg) => ({
      packageId: pkg.id,
      state: 'absent',
      source: 'yarn-state',
      reason: 'node_modules is absent.',
    })),
    complete: true,
    diagnostics: [],
  };
}

/*** Keep an existing node_modules tree unknown when Yarn state metadata is absent. */
function missingYarnState(
  rootId: string,
  packages: readonly ApmLockedPackageEvidence[],
): ApmManagerInstallationEvidence {
  return {
    linker: 'node-modules',
    installedPackages: packages.map((pkg) => unknownInstall(pkg.id, 'node_modules/.yarn-state.yml is absent.')),
    complete: false,
    diagnostics: [{
      code: 'status.install.yarn.state-missing',
      severity: 'warning',
      scope: { kind: 'install-root', id: rootId },
      evidence: ['node_modules/.yarn-state.yml'],
      reason: 'node_modules exists without Yarn installation-state evidence.',
    }],
  };
}

/*** Report unsupported Yarn linker modes as incomplete rather than guessed inventory. */
function unsupportedLinker(
  rootId: string,
  linker: string,
  packages: readonly ApmLockedPackageEvidence[],
): ApmManagerInstallationEvidence {
  return {
    linker,
    installedPackages: packages.map((pkg) => unknownInstall(pkg.id, 'Unsupported Yarn linker mode.')),
    complete: false,
    diagnostics: [{
      code: 'status.install.yarn.unsupported-linker',
      severity: 'error',
      scope: { kind: 'install-root', id: rootId },
      evidence: [`nodeLinker: ${linker}`],
      reason: `Yarn linker ${linker} is detected but not a complete APM inventory mode.`,
      nextAction: 'Use Yarn PnP or node-modules for complete status evidence.',
    }],
  };
}

/*** Build explicit unknown Yarn installation evidence with no false absence claim. */
function unknownInstall(packageId: string, reason: string): ApmInstalledPackageEvidence {
  return { packageId, state: 'unknown', source: 'unknown', reason };
}

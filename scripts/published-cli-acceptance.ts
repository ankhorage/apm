import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { isRecord, readOwnProperty } from '@ankhorage/utility/object';

const execFileAsync = promisify(execFile);
const APM_VERSION = '0.8.1';
const ANKH_VERSION = '0.8.13';
const DEPENDENCY_NAME = 'semver';
const INITIAL_DEPENDENCY_VERSION = '7.7.1';
const DEPENDENCY_RANGE = '^7.7.1';
const COMMAND_TIMEOUT_MS = 300_000;

type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun';

const manager = parseManager(process.argv[2]);
const fixtureRoot = await mkdtemp(path.join(tmpdir(), `ankhorage-apm-published-${manager}-`));

try {
  const managerVersion = await managerVersionAsync(manager, fixtureRoot);
  const toolRoot = path.join(fixtureRoot, 'tools');
  await installPublishedToolsAsync(toolRoot);
  await assertPublishedVersionAsync(toolRoot, '@ankhorage/apm', APM_VERSION);
  await assertPublishedVersionAsync(toolRoot, '@ankhorage/ankh', ANKH_VERSION);

  const standaloneRoot = path.join(fixtureRoot, 'standalone');
  const ankhRoot = path.join(fixtureRoot, 'ankh');
  await createOutdatedProjectAsync(standaloneRoot, manager, managerVersion);
  await createOutdatedProjectAsync(ankhRoot, manager, managerVersion);

  const standalone = await runLifecycleAsync({
    command: path.join(toolRoot, 'node_modules', '.bin', 'apm'),
    commandPrefix: [],
    projectRoot: standaloneRoot,
    toolRoot,
  });
  const throughAnkh = await runLifecycleAsync({
    command: path.join(toolRoot, 'node_modules', '.bin', 'ankh'),
    commandPrefix: ['apm'],
    projectRoot: ankhRoot,
    toolRoot,
  });

  assert.equal(standalone.targetVersion, throughAnkh.targetVersion);
  assert.deepEqual(standalone.planSteps, throughAnkh.planSteps);
  assert.equal(standalone.verified, true);
  assert.equal(throughAnkh.verified, true);

  const standaloneInstalled = await installedDependencyVersionAsync(standaloneRoot);
  const ankhInstalled = await installedDependencyVersionAsync(ankhRoot);
  assert.equal(standaloneInstalled, standalone.targetVersion);
  assert.equal(ankhInstalled, throughAnkh.targetVersion);
  assert.equal(standaloneInstalled, ankhInstalled);

  const lockfileName = managerLockfile(manager);
  assert.equal(
    await readFile(path.join(standaloneRoot, lockfileName), 'utf8'),
    await readFile(path.join(ankhRoot, lockfileName), 'utf8'),
  );

  console.log(
    JSON.stringify(
      {
        manager,
        managerVersion,
        apmVersion: APM_VERSION,
        ankhVersion: ANKH_VERSION,
        dependency: DEPENDENCY_NAME,
        from: INITIAL_DEPENDENCY_VERSION,
        to: standalone.targetVersion,
        standalone: { verified: standalone.verified, operationId: standalone.operationId },
        ankh: { verified: throughAnkh.verified, operationId: throughAnkh.operationId },
      },
      null,
      2,
    ),
  );
} finally {
  await rm(fixtureRoot, { force: true, recursive: true });
}

interface LifecycleInput {
  readonly command: string;
  readonly commandPrefix: readonly string[];
  readonly projectRoot: string;
  readonly toolRoot: string;
}

interface LifecycleResult {
  readonly targetVersion: string;
  readonly planSteps: readonly string[];
  readonly operationId: string;
  readonly verified: boolean;
}

/*** Exercise status, plan, reviewed apply and verify through one published CLI adapter. */
async function runLifecycleAsync(input: LifecycleInput): Promise<LifecycleResult> {
  const status = await runJsonCommandAsync(input, ['status', input.projectRoot, '--json']);
  assert.equal(readOwnProperty(status, 'complete'), true);
  assert.equal(readOwnProperty(status, 'currency'), 'outdated');

  const plan = await runJsonCommandAsync(input, ['plan', input.projectRoot, '--json']);
  assert.equal(readOwnProperty(plan, 'complete'), true);
  const target = findDependencyTarget(plan);
  const targetVersion = readRequiredString(target, 'targetVersion');
  assert.equal(readRequiredString(target, 'currentVersion'), INITIAL_DEPENDENCY_VERSION);
  assert.notEqual(targetVersion, INITIAL_DEPENDENCY_VERSION);

  const planPath = path.join(input.projectRoot, 'apm-plan.json');
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  const apply = await runJsonCommandAsync(input, ['apply', '--plan', planPath, '--json']);
  assert.equal(readOwnProperty(apply, 'status'), 'completed');
  const operationId = readRequiredString(apply, 'operationId');

  const verify = await runJsonCommandAsync(input, [
    'verify',
    '--operation',
    operationId,
    input.projectRoot,
    '--json',
  ]);
  assert.equal(readOwnProperty(verify, 'verified'), true);

  const followUpPlan = await runJsonCommandAsync(input, ['plan', input.projectRoot, '--json']);
  assert.equal(readOwnProperty(followUpPlan, 'complete'), true);
  assert.equal(readArray(followUpPlan, 'targets').length, 0);

  return {
    targetVersion,
    planSteps: readArray(plan, 'steps').map((step) => readRequiredString(step, 'id')),
    operationId,
    verified: readOwnProperty(verify, 'verified') === true,
  };
}

/*** Run one published APM command and parse its structured JSON result. */
async function runJsonCommandAsync(
  input: LifecycleInput,
  args: readonly string[],
): Promise<Readonly<Record<string, unknown>>> {
  const stdout = await runCommandAsync(
    input.command,
    [...input.commandPrefix, ...args],
    input.toolRoot,
  );
  const value: unknown = JSON.parse(extractJson(stdout));
  if (!isRecord(value)) throw new Error(`Expected object JSON from ${input.command}.`);
  return value;
}

/*** Install the exact published APM and Ankh packages into an external consumer. */
async function installPublishedToolsAsync(toolRoot: string): Promise<void> {
  await mkdir(toolRoot, { recursive: true });
  await writeJsonAsync(path.join(toolRoot, 'package.json'), {
    name: 'ankhorage-apm-published-acceptance-tools',
    private: true,
    type: 'module',
    dependencies: {
      '@ankhorage/apm': APM_VERSION,
      '@ankhorage/ankh': ANKH_VERSION,
    },
  });
  await runCommandAsync('bun', ['install', '--ignore-scripts'], toolRoot);
}

/*** Create a real installed old dependency graph while leaving a compatible newer range declared. */
async function createOutdatedProjectAsync(
  projectRoot: string,
  packageManager: PackageManagerName,
  packageManagerVersion: string,
): Promise<void> {
  await mkdir(projectRoot, { recursive: true });
  if (packageManager === 'yarn') {
    await writeFile(path.join(projectRoot, '.yarnrc.yml'), 'nodeLinker: node-modules\n', 'utf8');
  }
  await writeProjectManifestAsync(
    projectRoot,
    packageManager,
    packageManagerVersion,
    INITIAL_DEPENDENCY_VERSION,
  );
  await installProjectAsync(projectRoot, packageManager);
  await writeProjectManifestAsync(
    projectRoot,
    packageManager,
    packageManagerVersion,
    DEPENDENCY_RANGE,
  );
}

/*** Persist the customer fixture manifest with one intentionally old direct dependency. */
async function writeProjectManifestAsync(
  projectRoot: string,
  packageManager: PackageManagerName,
  packageManagerVersion: string,
  dependencyRange: string,
): Promise<void> {
  await writeJsonAsync(path.join(projectRoot, 'package.json'), {
    name: `published-${packageManager}-fixture`,
    private: true,
    type: 'module',
    packageManager: `${packageManager}@${packageManagerVersion}`,
    dependencies: { [DEPENDENCY_NAME]: dependencyRange },
  });
}

/*** Materialize the old graph with the manager under test and lifecycle scripts disabled. */
async function installProjectAsync(
  projectRoot: string,
  packageManager: PackageManagerName,
): Promise<void> {
  if (packageManager === 'npm') {
    await runCommandAsync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], projectRoot);
    return;
  }
  if (packageManager === 'pnpm') {
    await runCommandAsync('pnpm', ['install', '--ignore-scripts'], projectRoot);
    return;
  }
  if (packageManager === 'yarn') {
    await runCommandAsync('yarn', ['install', '--mode=skip-build'], projectRoot, {
      YARN_ENABLE_SCRIPTS: 'false',
    });
    return;
  }
  await runCommandAsync('bun', ['install', '--ignore-scripts'], projectRoot);
}

/*** Read the physical installed version produced by the reviewed apply operation. */
async function installedDependencyVersionAsync(projectRoot: string): Promise<string> {
  const value: unknown = JSON.parse(
    await readFile(path.join(projectRoot, 'node_modules', DEPENDENCY_NAME, 'package.json'), 'utf8'),
  );
  if (!isRecord(value)) throw new Error('Installed dependency manifest is not an object.');
  return readRequiredString(value, 'version');
}

/*** Verify the external consumer resolved the requested published package version exactly. */
async function assertPublishedVersionAsync(
  toolRoot: string,
  packageName: string,
  expectedVersion: string,
): Promise<void> {
  const value: unknown = JSON.parse(
    await readFile(path.join(toolRoot, 'node_modules', ...packageName.split('/'), 'package.json'), 'utf8'),
  );
  if (!isRecord(value)) throw new Error(`Invalid installed package metadata for ${packageName}.`);
  assert.equal(readOwnProperty(value, 'version'), expectedVersion);
}

/*** Return the exact package-manager version exercised by this CI lane. */
async function managerVersionAsync(
  packageManager: PackageManagerName,
  cwd: string,
): Promise<string> {
  return (await runCommandAsync(packageManager, ['--version'], cwd)).trim();
}

/*** Execute a subprocess with bounded output and fail with the captured command diagnostics. */
async function runCommandAsync(
  command: string,
  args: readonly string[],
  cwd: string,
  extraEnv: Readonly<Record<string, string>> = {},
): Promise<string> {
  try {
    const result = await execFileAsync(command, [...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...extraEnv },
      maxBuffer: 16 * 1024 * 1024,
      timeout: COMMAND_TIMEOUT_MS,
    });
    return String(result.stdout);
  } catch (error) {
    if (isRecord(error)) {
      const stderr = readOwnProperty(error, 'stderr');
      const stdout = readOwnProperty(error, 'stdout');
      throw new Error(
        `${command} ${args.join(' ')} failed\nstdout:\n${String(stdout ?? '')}\nstderr:\n${String(stderr ?? '')}`,
      );
    }
    throw error;
  }
}

/*** Find the one reviewed direct dependency update target in a structured APM plan. */
function findDependencyTarget(plan: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const targets = readArray(plan, 'targets').filter(
    (target) => isRecord(target) && readOwnProperty(target, 'name') === DEPENDENCY_NAME,
  );
  assert.equal(targets.length, 1);
  const [target] = targets;
  if (!isRecord(target)) throw new Error('Expected one dependency target object.');
  return target;
}

/*** Read one JSON array property without unsafe contract assertions. */
function readArray(value: Readonly<Record<string, unknown>>, key: string): readonly unknown[] {
  const property = readOwnProperty(value, key);
  if (!Array.isArray(property)) throw new Error(`Expected ${key} to be an array.`);
  return property;
}

/*** Read one required string property from structured acceptance evidence. */
function readRequiredString(value: unknown, key: string): string {
  if (!isRecord(value)) throw new Error(`Expected object while reading ${key}.`);
  const property = readOwnProperty(value, key);
  if (typeof property !== 'string') throw new Error(`Expected ${key} to be a string.`);
  return property;
}

/*** Serialize deterministic fixture JSON with the repository's normal trailing newline convention. */
async function writeJsonAsync(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/*** Extract the single JSON object emitted by a structured CLI command. */
function extractJson(stdout: string): string {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`Command did not emit JSON:\n${stdout}`);
  return stdout.slice(start, end + 1);
}

/*** Restrict acceptance execution to the package managers explicitly supported by APM. */
function parseManager(value: string | undefined): PackageManagerName {
  if (value === 'npm' || value === 'pnpm' || value === 'yarn' || value === 'bun') return value;
  throw new Error('Usage: bun scripts/published-cli-acceptance.ts <npm|pnpm|yarn|bun>');
}

/*** Return the canonical lockfile whose bytes must agree between standalone and Ankh execution. */
function managerLockfile(packageManager: PackageManagerName): string {
  if (packageManager === 'npm') return 'package-lock.json';
  if (packageManager === 'pnpm') return 'pnpm-lock.yaml';
  if (packageManager === 'yarn') return 'yarn.lock';
  return 'bun.lock';
}

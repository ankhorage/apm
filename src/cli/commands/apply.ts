import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { applyProjectAsync } from '../../features/apply/composition/applyProjectAsync.js';
import { parsePlanResult } from '../../features/plan/domain/parsePlanResult.js';
import type { ApmApplyPermissions, ApmApplyResult } from '../../types/apply.js';
import type { ApmCliCommand } from '../../types/cli.js';

const PERMISSION_FLAGS = [
  '--allow-owner-code',
  '--allow-lifecycle-scripts',
  '--allow-external-effects',
] as const;

/*** Map explicit plan/recovery CLI input to the shared durable Node apply use case. */
export const apply = {
  path: ['apply'],
  capability: 'apm.apply',
  summary: 'Apply a selected still-valid update plan with recovery semantics.',
  executeAsync: async (argv, context) => {
    const parsed = parseApplyArguments(argv);
    const input =
      parsed.mode === 'start'
        ? {
            mode: 'start' as const,
            plan: await readPlanAsync(path.resolve(context.cwd, parsed.planPath)),
            permissions: parsed.permissions,
          }
        : {
            mode: 'resume' as const,
            rootPath: path.resolve(context.cwd, parsed.rootPath),
            operationId: parsed.operationId,
            permissions: parsed.permissions,
          };
    const result = await applyProjectAsync(input);
    renderResult(result, parsed.json, context.writeStdout);
    return exitCode(result);
  },
} satisfies ApmCliCommand;

interface ParsedApplyStart {
  readonly mode: 'start';
  readonly planPath: string;
  readonly json: boolean;
  readonly permissions: ApmApplyPermissions;
}

interface ParsedApplyResume {
  readonly mode: 'resume';
  readonly rootPath: string;
  readonly operationId: string;
  readonly json: boolean;
  readonly permissions: ApmApplyPermissions;
}

type ParsedApplyArguments = ParsedApplyStart | ParsedApplyResume;

/*** Parse mutually exclusive plan-start and durable-resume CLI modes. */
function parseApplyArguments(argv: readonly string[]): ParsedApplyArguments {
  const planPath = flagValue(argv, '--plan');
  const operationId = flagValue(argv, '--resume');
  const json = argv.includes('--json');
  const permissions = permissionsFromArgs(argv);
  const consumed = new Set([
    '--json',
    ...PERMISSION_FLAGS,
    ...(planPath === undefined ? [] : ['--plan', planPath]),
    ...(operationId === undefined ? [] : ['--resume', operationId]),
  ]);
  const positionals = argv.filter((argument) => !consumed.has(argument));
  if (positionals.some((argument) => argument.startsWith('-'))) usageError();
  if ((planPath === undefined) === (operationId === undefined)) usageError();
  if (planPath !== undefined) {
    if (positionals.length > 0) usageError();
    return { mode: 'start', planPath, json, permissions };
  }
  if (operationId === undefined || positionals.length > 1) usageError();
  return {
    mode: 'resume',
    operationId,
    rootPath: positionals[0] ?? '.',
    json,
    permissions,
  };
}

/*** Read and validate an executable plan schema instead of trusting arbitrary JSON input. */
async function readPlanAsync(planPath: string) {
  const content = await readFile(planPath, 'utf8');
  const value: unknown = JSON.parse(content);
  const plan = parsePlanResult(value);
  if (plan === undefined) throw new Error(`Invalid or unsupported APM plan: ${planPath}`);
  return plan;
}

/*** Read one CLI flag value while rejecting duplicate/missing values deterministically. */
function flagValue(argv: readonly string[], flag: '--plan' | '--resume'): string | undefined {
  const positions = argv.flatMap((argument, index) => (argument === flag ? [index] : []));
  if (positions.length === 0) return undefined;
  if (positions.length !== 1) usageError();
  const value = argv[(positions[0] ?? -1) + 1];
  if (value === undefined || value.startsWith('-')) usageError();
  return value;
}

/*** Map explicit execution-consent flags to the headless structured permission input. */
function permissionsFromArgs(argv: readonly string[]): ApmApplyPermissions {
  return {
    ownerCode: argv.includes('--allow-owner-code'),
    lifecycleScripts: argv.includes('--allow-lifecycle-scripts'),
    externalEffects: argv.includes('--allow-external-effects'),
  };
}

/*** Render JSON or compact human apply status without changing domain semantics. */
function renderResult(
  result: ApmApplyResult,
  json: boolean,
  writeStdout: (value: string) => void,
): void {
  if (json) {
    writeStdout(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  writeStdout(
    [
      `APM apply: ${result.status}`,
      `Root: ${result.rootPath}`,
      `Operation ID: ${result.operationId}`,
      ...(result.planId === undefined ? [] : [`Plan ID: ${result.planId}`]),
      `Blockers: ${result.blockers.length}`,
    ].join('\n') + '\n',
  );
}

/*** Preserve distinct machine-readable recovery/failure outcomes in the process exit code. */
function exitCode(result: ApmApplyResult): number {
  switch (result.status) {
    case 'completed':
      return 0;
    case 'blocked':
      return 2;
    case 'failed':
      return 4;
    case 'cancelled':
      return 5;
    case 'recovery-required':
      return 6;
  }
}

/*** Throw the canonical apply usage error from every invalid argument shape. */
function usageError(): never {
  throw new Error(
    'Usage: apm apply (--plan <plan.json> | --resume <operationId> [directory]) [--json] [--allow-owner-code] [--allow-lifecycle-scripts] [--allow-external-effects]',
  );
}

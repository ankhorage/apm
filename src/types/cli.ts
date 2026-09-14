export type ApmOperation = 'status' | 'plan' | 'apply' | 'verify';

export type ApmUnavailableOperation = Exclude<ApmOperation, 'status'>;

export interface ApmCliContext {
  readonly cwd: string;
  readonly writeStdout: (text: string) => void;
  readonly writeStderr: (text: string) => void;
}

export interface ApmCliCommand {
  readonly path: readonly [ApmOperation];
  readonly capability: `apm.${ApmOperation}`;
  readonly summary: string;
  readonly executeAsync: (
    argv: readonly string[],
    context: ApmCliContext,
  ) => number | Promise<number>;
}

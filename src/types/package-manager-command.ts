export interface ApmPackageManagerCommand {
  readonly executable: string;
  readonly args: readonly string[];
}

export interface ApmPackageManagerCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ApmPackageManagerCommandOptions {
  readonly lifecycleScripts: boolean;
  readonly timeoutMs?: number;
}

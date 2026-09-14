export interface ApmPlanStageFile {
  readonly relativePath: string;
  readonly sourcePath: string;
  readonly stagedPath: string;
  readonly role: 'mutable' | 'configuration';
  readonly beforeContent?: string;
}

export interface ApmPlanStage {
  readonly rootPath: string;
  readonly files: readonly ApmPlanStageFile[];
}

export interface ApmPackageManagerPlanCommand {
  readonly executable: string;
  readonly args: readonly string[];
}

export interface ApmPlanCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

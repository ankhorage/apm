export interface ApmApplyFileSnapshot {
  readonly path: string;
  readonly exists: boolean;
  readonly contentBase64?: string;
}

export interface ApmApplyStepSnapshot {
  readonly schemaVersion: 1;
  readonly stepId: string;
  readonly files: readonly ApmApplyFileSnapshot[];
}

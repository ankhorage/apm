export interface ApmRegistryConfig {
  readonly defaultRegistry: string;
  readonly scopedRegistries: ReadonlyMap<string, string>;
  readonly values: ReadonlyMap<string, string>;
}

export interface ApmRegistryMetadata {
  readonly latestVersion?: string;
  readonly versions: readonly string[];
}

export interface ApmRegistryCacheEntry {
  readonly fetchedAt: number;
  readonly checkedAt: string;
  readonly metadata: ApmRegistryMetadata;
  readonly registry: string;
}

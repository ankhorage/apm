# Public API

## APM_STATUS_SUPPORT

Kind: `value`
Module: `src/features/status/constants/support.ts`
Source: `src/features/status/constants/support.ts:45:14`

Publish the exact read-only status matrix proven by the evidence adapters.

Runtime: APM requires Node 24 or newer. Development uses Bun 1.4.2, but inspected customer
projects may use any explicitly supported manager below.

Ordinary JavaScript and TypeScript projects require no `ankh.config.json`. APM derives package,
workspace and package-manager evidence from Project Detector plus package-manager-native files.
Detected non-JavaScript ecosystems remain inspection-only until an explicit APM adapter owns
their dependency semantics; they never become a false complete/current result.

Install-root selection is evidence based. An explicit `packageManager` declaration wins over
lockfile heuristics while stale lockfiles from other managers remain diagnostic evidence. If
multiple manager lockfiles exist without an explicit selection, the root is conflicting and
incomplete. Nested packages that carry their own manager/lock evidence become independent
install roots rather than being folded into the parent workspace.

npm: package-lock v2 and v3 are parsed. The physical node_modules locations recorded by npm are
checked without executing package code. package-lock v1 is detected but remains inspection-only.
Duplicate versions remain separate physical package instances and dependency edges retain the
instance identity they actually resolve to.

pnpm: lockfile v9 is parsed, including importer roots, package/snapshot instance identities,
workspace links and peer-context suffixes. Installed state is confirmed from the pnpm virtual
store lock when present; unknown/custom layouts stay explicit. Peer variants therefore remain
distinct package instances rather than being collapsed by package name.

Yarn: Berry lock metadata v8 is parsed. `nodeLinker: node-modules` uses `.yarn-state.yml`;
`nodeLinker: pnp` reads `.pnp.data.json` when present and never executes `.pnp.cjs`. An inlined
PnP map therefore remains incomplete by design. Yarn Classic and Yarn's pnpm linker are detected
but are not claimed as complete inventory modes in this release.

Bun: text `bun.lock` v2 is parsed. Bun's isolated `.bun` store and ordinary node_modules links are
inspected as data. Binary `bun.lockb` and unknown lock versions are inspection-only.

Registry availability uses npm-compatible registries selected from project/user npmrc and
environment overrides. Credentials are used only at the HTTP edge and are never returned in
reports. Offline cache misses and registry/auth/network failures make availability unknown.

`status` is read-only. It reads manifests, lockfiles, installation metadata and registry data;
it does not install packages, execute lifecycle hooks, run migrations or write project files.
`plan`, `apply`, and `verify` remain separate roadmap operations.

## ApmAvailabilityEvidence

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:182:1`

### Members

| Name        | Kind     | Type                                        | Required | Description |
| ----------- | -------- | ------------------------------------------- | -------- | ----------- |
| complete    | property | `boolean`                                   | yes      |             |
| diagnostics | property | `readonly ApmStatusDiagnostic[]`            | yes      |             |
| packages    | property | `readonly ApmPackageAvailabilityEvidence[]` | yes      |             |

## ApmAvailabilityRequest

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:162:1`

### Members

| Name           | Kind     | Type                                                        | Required | Description |
| -------------- | -------- | ----------------------------------------------------------- | -------- | ----------- |
| currentVersion | property | `string`                                                    | no       |             |
| declaredRange  | property | `string`                                                    | no       |             |
| name           | property | `string`                                                    | yes      |             |
| packageId      | property | `string`                                                    | yes      |             |
| role           | property | `"application" \| "host"`                                   | yes      |             |
| source         | property | `"registry" \| "workspace" \| "file" \| "git" \| "unknown"` | no       |             |

## ApmDependencyDeclaration

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:86:1`

### Members

| Name              | Kind     | Type                | Required | Description |
| ----------------- | -------- | ------------------- | -------- | ----------- |
| kind              | property | `ApmDependencyKind` | yes      |             |
| name              | property | `string`            | yes      |             |
| ownerPath         | property | `string`            | yes      |             |
| range             | property | `string`            | yes      |             |
| resolvedPackageId | property | `string`            | no       |             |

## ApmDependencyInventory

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:150:1`

### Members

| Name        | Kind     | Type                                 | Required | Description |
| ----------- | -------- | ------------------------------------ | -------- | ----------- |
| complete    | property | `boolean`                            | yes      |             |
| diagnostics | property | `readonly ApmStatusDiagnostic[]`     | yes      |             |
| roots       | property | `readonly ApmInstallRootInventory[]` | yes      |             |

## ApmDependencyKind

Kind: `unknown`
Module: `src/types/status.ts`
Source: `src/types/status.ts:9:1`

## ApmExtensionEvidence

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:206:1`

### Members

| Name         | Kind     | Type                                 | Required | Description |
| ------------ | -------- | ------------------------------------ | -------- | ----------- |
| complete     | property | `boolean`                            | yes      |             |
| diagnostics  | property | `readonly ApmStatusDiagnostic[]`     | yes      |             |
| observations | property | `readonly ApmExtensionObservation[]` | yes      |             |
| state        | property | `"available" \| "unavailable"`       | yes      |             |

## ApmExtensionObservation

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:196:1`

### Members

| Name       | Kind     | Type                 | Required | Description |
| ---------- | -------- | -------------------- | -------- | ----------- |
| evidence   | property | `readonly string[]`  | yes      |             |
| migration  | property | `ApmMigrationState`  | yes      |             |
| nextAction | property | `string`             | no       |             |
| owner      | property | `string`             | no       |             |
| packageId  | property | `string`             | no       |             |
| projection | property | `ApmProjectionState` | yes      |             |
| reason     | property | `string`             | no       |             |

## ApmInstallationState

Kind: `unknown`
Module: `src/types/status.ts`
Source: `src/types/status.ts:12:1`

## ApmInstalledPackageEvidence

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:111:1`

### Members

| Name      | Kind     | Type                                                                                       | Required | Description |
| --------- | -------- | ------------------------------------------------------------------------------------------ | -------- | ----------- |
| location  | property | `string`                                                                                   | no       |             |
| packageId | property | `string`                                                                                   | yes      |             |
| reason    | property | `string`                                                                                   | no       |             |
| source    | property | `"unknown" \| "node-modules" \| "pnpm-store" \| "yarn-state" \| "pnp-data" \| "bun-store"` | yes      |             |
| state     | property | `ApmInstallationState`                                                                     | yes      |             |
| version   | property | `string`                                                                                   | no       |             |

## ApmInstallRootInventory

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:136:1`

### Members

| Name              | Kind     | Type                                     | Required | Description |
| ----------------- | -------- | ---------------------------------------- | -------- | ----------- |
| complete          | property | `boolean`                                | yes      |             |
| declarations      | property | `readonly ApmDependencyDeclaration[]`    | yes      |             |
| diagnostics       | property | `readonly ApmStatusDiagnostic[]`         | yes      |             |
| id                | property | `string`                                 | yes      |             |
| installedPackages | property | `readonly ApmInstalledPackageEvidence[]` | yes      |             |
| linker            | property | `string`                                 | no       |             |
| lockedPackages    | property | `readonly ApmLockedPackageEvidence[]`    | yes      |             |
| lockfile          | property | `ApmLockfileEvidence`                    | yes      |             |
| manager           | property | `ApmPackageManagerEvidence`              | yes      |             |
| packagePaths      | property | `readonly string[]`                      | yes      |             |
| rootPath          | property | `string`                                 | yes      |             |

## ApmLockedDependencyEdge

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:94:1`

### Members

| Name      | Kind     | Type     | Required | Description |
| --------- | -------- | -------- | -------- | ----------- |
| name      | property | `string` | yes      |             |
| packageId | property | `string` | no       |             |
| requested | property | `string` | yes      |             |

## ApmLockedPackageEvidence

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:100:1`

### Members

| Name         | Kind     | Type                                                        | Required | Description |
| ------------ | -------- | ----------------------------------------------------------- | -------- | ----------- |
| dependencies | property | `readonly ApmLockedDependencyEdge[]`                        | yes      |             |
| id           | property | `string`                                                    | yes      |             |
| location     | property | `string`                                                    | no       |             |
| name         | property | `string`                                                    | yes      |             |
| optional     | property | `boolean`                                                   | yes      |             |
| peerContext  | property | `string`                                                    | no       |             |
| source       | property | `"registry" \| "workspace" \| "file" \| "git" \| "unknown"` | yes      |             |
| version      | property | `string`                                                    | no       |             |

## ApmLockfileEvidence

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:128:1`

### Members

| Name     | Kind     | Type                                                      | Required | Description |
| -------- | -------- | --------------------------------------------------------- | -------- | ----------- |
| evidence | property | `readonly string[]`                                       | yes      |             |
| format   | property | `string`                                                  | no       |             |
| path     | property | `string`                                                  | no       |             |
| state    | property | `"supported" \| "unsupported" \| "missing" \| "conflict"` | yes      |             |
| version  | property | `string`                                                  | no       |             |

## ApmMigrationState

Kind: `unknown`
Module: `src/types/status.ts`
Source: `src/types/status.ts:16:1`

## ApmPackageAvailabilityEvidence

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:171:1`

### Members

| Name              | Kind     | Type                                       | Required | Description |
| ----------------- | -------- | ------------------------------------------ | -------- | ----------- |
| checkedAt         | property | `string`                                   | no       |             |
| compatibleVersion | property | `string`                                   | no       |             |
| latestVersion     | property | `string`                                   | no       |             |
| name              | property | `string`                                   | yes      |             |
| packageId         | property | `string`                                   | yes      |             |
| reason            | property | `string`                                   | no       |             |
| registry          | property | `string`                                   | no       |             |
| state             | property | `"unknown" \| "not-applicable" \| "known"` | yes      |             |

## ApmPackageManagerEvidence

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:121:1`

### Members

| Name    | Kind     | Type                                                          | Required | Description |
| ------- | -------- | ------------------------------------------------------------- | -------- | ----------- |
| name    | property | `ApmPackageManagerName`                                       | no       |             |
| source  | property | `"package-manager-field" \| "lockfile" \| "project-detector"` | no       |             |
| state   | property | `"unknown" \| "conflict" \| "selected"`                       | yes      |             |
| version | property | `string`                                                      | no       |             |

## ApmPackageManagerName

Kind: `unknown`
Module: `src/types/status.ts`
Source: `src/types/status.ts:7:1`

## ApmProjectionState

Kind: `unknown`
Module: `src/types/status.ts`
Source: `src/types/status.ts:14:1`

## ApmRegistryAvailabilityOptions

Kind: `type`
Module: `src/types/registry.ts`
Source: `src/types/registry.ts:6:1`

### Members

| Name        | Kind     | Type                                            | Required | Description |
| ----------- | -------- | ----------------------------------------------- | -------- | ----------- |
| cacheTtlMs  | property | `number`                                        | no       |             |
| env         | property | `Readonly<Record<string, string \| undefined>>` | no       |             |
| fetchFn     | property | `ApmRegistryFetch`                              | no       |             |
| home        | property | `string`                                        | no       |             |
| maxRequests | property | `number`                                        | no       |             |
| now         | property | `() => number`                                  | no       |             |

## ApmRegistryFetch

Kind: `unknown`
Module: `src/types/registry.ts`
Source: `src/types/registry.ts:1:1`

## ApmStatusAvailabilityMode

Kind: `unknown`
Module: `src/types/status.ts`
Source: `src/types/status.ts:5:1`

## ApmStatusAvailabilityPort

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:188:1`

### Members

| Name                   | Kind     | Type                                                                                                                                                                          | Required | Description |
| ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| queryAvailabilityAsync | property | `(input: { readonly rootPath: string; readonly mode: ApmStatusAvailabilityMode; readonly packages: readonly ApmAvailabilityRequest[]; }) => Promise<ApmAvailabilityEvidence>` | yes      |             |

## ApmStatusCurrency

Kind: `unknown`
Module: `src/types/status.ts`
Source: `src/types/status.ts:3:1`

## ApmStatusDependency

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:227:1`

### Members

| Name            | Kind     | Type                             | Required | Description |
| --------------- | -------- | -------------------------------- | -------- | ----------- |
| availability    | property | `ApmPackageAvailabilityEvidence` | yes      |             |
| declaration     | property | `ApmDependencyDeclaration`       | no       |             |
| dependencyPaths | property | `readonly (readonly string[])[]` | yes      |             |
| direct          | property | `boolean`                        | yes      |             |
| findings        | property | `readonly ApmStatusFinding[]`    | yes      |             |
| installed       | property | `ApmInstalledPackageEvidence`    | yes      |             |
| installRootId   | property | `string`                         | yes      |             |
| lockedVersion   | property | `string`                         | no       |             |
| name            | property | `string`                         | yes      |             |
| packageId       | property | `string`                         | yes      |             |

## ApmStatusDependencyInventoryPort

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:156:1`

### Members

| Name                            | Kind     | Type                                                                                      | Required | Description |
| ------------------------------- | -------- | ----------------------------------------------------------------------------------------- | -------- | ----------- |
| inspectDependencyInventoryAsync | property | `(input: { readonly inspection: ProjectInspection; }) => Promise<ApmDependencyInventory>` | yes      |             |

## ApmStatusDiagnostic

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:50:1`

### Members

| Name       | Kind     | Type                             | Required | Description |
| ---------- | -------- | -------------------------------- | -------- | ----------- |
| code       | property | `string`                         | yes      |             |
| evidence   | property | `readonly string[]`              | yes      |             |
| nextAction | property | `string`                         | no       |             |
| reason     | property | `string`                         | yes      |             |
| scope      | property | `ApmStatusDiagnosticScope`       | yes      |             |
| severity   | property | `"info" \| "warning" \| "error"` | yes      |             |

## ApmStatusDiagnosticScope

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:43:1`

### Members

| Name | Kind     | Type                                                                                              | Required | Description |
| ---- | -------- | ------------------------------------------------------------------------------------------------- | -------- | ----------- |
| id   | property | `string`                                                                                          | no       |             |
| kind | property | `"host" \| "registry" \| "project" \| "install-root" \| "package" \| "projection" \| "migration"` | yes      |             |
| path | property | `string`                                                                                          | no       |             |

## ApmStatusExtensionEvidencePort

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:213:1`

### Members

| Name                          | Kind     | Type                                                                                                                   | Required | Description |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| inspectExtensionEvidenceAsync | property | `(input: { readonly rootPath: string; readonly inventory: ApmDependencyInventory; }) => Promise<ApmExtensionEvidence>` | yes      |             |

## ApmStatusFinding

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:59:1`

### Members

| Name       | Kind     | Type                       | Required | Description |
| ---------- | -------- | -------------------------- | -------- | ----------- |
| code       | property | `ApmStatusFindingCode`     | yes      |             |
| evidence   | property | `readonly string[]`        | yes      |             |
| nextAction | property | `string`                   | no       |             |
| reason     | property | `string`                   | yes      |             |
| scope      | property | `ApmStatusDiagnosticScope` | yes      |             |

## ApmStatusFindingCode

Kind: `unknown`
Module: `src/types/status.ts`
Source: `src/types/status.ts:18:1`

## ApmStatusHostPackage

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:36:1`

### Members

| Name          | Kind     | Type     | Required | Description |
| ------------- | -------- | -------- | -------- | ----------- |
| declaredRange | property | `string` | no       |             |
| id            | property | `string` | yes      |             |
| name          | property | `string` | yes      |             |
| version       | property | `string` | yes      |             |

## ApmStatusHostPackageResult

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:240:1`

### Members

| Name          | Kind     | Type                             | Required | Description |
| ------------- | -------- | -------------------------------- | -------- | ----------- |
| availability  | property | `ApmPackageAvailabilityEvidence` | yes      |             |
| declaredRange | property | `string`                         | no       |             |
| findings      | property | `readonly ApmStatusFinding[]`    | yes      |             |
| id            | property | `string`                         | yes      |             |
| name          | property | `string`                         | yes      |             |
| version       | property | `string`                         | yes      |             |

## ApmStatusInput

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:30:1`

### Members

| Name         | Kind     | Type                              | Required | Description |
| ------------ | -------- | --------------------------------- | -------- | ----------- |
| availability | property | `ApmStatusAvailabilityMode`       | no       |             |
| hostPackages | property | `readonly ApmStatusHostPackage[]` | no       |             |
| rootPath     | property | `string`                          | yes      |             |

## ApmStatusLanguage

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:67:1`

### Members

| Name        | Kind     | Type                | Required | Description |
| ----------- | -------- | ------------------- | -------- | ----------- |
| id          | property | `string`            | yes      |             |
| score       | property | `number`            | yes      |             |
| sourceRoots | property | `readonly string[]` | yes      |             |

## ApmStatusPorts

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:220:1`

### Members

| Name                | Kind     | Type                               | Required | Description |
| ------------------- | -------- | ---------------------------------- | -------- | ----------- |
| availability        | property | `ApmStatusAvailabilityPort`        | yes      |             |
| dependencyInventory | property | `ApmStatusDependencyInventoryPort` | yes      |             |
| extensions          | property | `ApmStatusExtensionEvidencePort`   | no       |             |
| projectInspection   | property | `ApmStatusProjectInspectionPort`   | yes      |             |

## ApmStatusProjectInspectionPort

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:82:1`

### Members

| Name                | Kind     | Type                                               | Required | Description |
| ------------------- | -------- | -------------------------------------------------- | -------- | ----------- |
| inspectProjectAsync | property | `(rootPath: string) => Promise<ProjectInspection>` | yes      |             |

## ApmStatusProjectSummary

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:73:1`

### Members

| Name            | Kind     | Type                           | Required | Description |
| --------------- | -------- | ------------------------------ | -------- | ----------- |
| buildTools      | property | `readonly string[]`            | yes      |             |
| languages       | property | `readonly ApmStatusLanguage[]` | yes      |             |
| packageCount    | property | `number`                       | yes      |             |
| packageManagers | property | `readonly string[]`            | yes      |             |
| traits          | property | `readonly string[]`            | yes      |             |
| workspaceCount  | property | `number`                       | yes      |             |

## ApmStatusResult

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:245:1`

### Members

| Name          | Kind     | Type                                    | Required | Description |
| ------------- | -------- | --------------------------------------- | -------- | ----------- |
| complete      | property | `boolean`                               | yes      |             |
| currency      | property | `ApmStatusCurrency`                     | yes      |             |
| dependencies  | property | `readonly ApmStatusDependency[]`        | yes      |             |
| diagnostics   | property | `readonly ApmStatusDiagnostic[]`        | yes      |             |
| extensions    | property | `ApmExtensionEvidence`                  | yes      |             |
| findings      | property | `readonly ApmStatusFinding[]`           | yes      |             |
| hosts         | property | `readonly ApmStatusHostPackageResult[]` | yes      |             |
| installRoots  | property | `readonly ApmInstallRootInventory[]`    | yes      |             |
| operation     | property | `"status"`                              | yes      |             |
| project       | property | `ApmStatusProjectSummary`               | yes      |             |
| rootPath      | property | `string`                                | yes      |             |
| schemaVersion | property | `2`                                     | yes      |             |

## createCliProvider

Kind: `function`
Module: `src/cli/createCliProvider.ts`
Source: `src/cli/createCliProvider.ts:10:1`

Create the thin Ankh command provider over the same standalone APM command adapter.

### Signatures

- `(version: string) => AnkhRuntimeCommandProvider`
  - version: `string`
  - returns: `AnkhRuntimeCommandProvider`

## createNpmRegistryAvailabilityPort

Kind: `function`
Module: `src/features/status/adapters/outbound/createNpmRegistryAvailabilityPort.ts`
Source: `src/features/status/adapters/outbound/createNpmRegistryAvailabilityPort.ts:19:1`

Create a bounded npm-compatible registry adapter with redacted config and process-local TTL cache.

### Signatures

- `(options?: ApmRegistryAvailabilityOptions) => ApmStatusAvailabilityPort`
  - options: `ApmRegistryAvailabilityOptions` (optional)
  - returns: `ApmStatusAvailabilityPort`

## inspectDependencyInventoryAsync

Kind: `function`
Module: `src/features/status/adapters/outbound/inspectDependencyInventoryAsync.ts`
Source: `src/features/status/adapters/outbound/inspectDependencyInventoryAsync.ts:23:1`

Inspect package declarations, lock instances, and installed state without running package code.

### Signatures

- `(input: { readonly inspection: ProjectInspection; }) => Promise<ApmDependencyInventory>`
  - input: `{ readonly inspection: ProjectInspection; }`
  - returns: `Promise<ApmDependencyInventory>`

## statusAsync

Kind: `function`
Module: `src/features/status/application/statusAsync.ts`
Source: `src/features/status/application/statusAsync.ts:20:1`

Build evidence-based, serializable APM status without mutating the inspected project.

The use case separates Project Detector evidence, package-manager inventory, registry
availability, and optional package-owned projection/migration evidence behind outbound ports.
Missing or partial evidence makes currency `unknown`; it never becomes a green current result.
Hosts can call this boundary without a terminal and can test it with deterministic fake ports.

### Signatures

- `(input: ApmStatusInput, ports: ApmStatusPorts) => Promise<ApmStatusResult>`
  - input: `ApmStatusInput`
  - ports: `ApmStatusPorts`
  - returns: `Promise<ApmStatusResult>`

## statusProjectAsync

Kind: `function`
Module: `src/features/status/composition/statusProjectAsync.ts`
Source: `src/features/status/composition/statusProjectAsync.ts:10:1`

Compose APM status with published Project Detector, local package-manager, and registry edges.

### Signatures

- `(input: ApmStatusInput) => Promise<ApmStatusResult>`
  - input: `ApmStatusInput`
  - returns: `Promise<ApmStatusResult>`

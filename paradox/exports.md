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

## ApmCompatibilityConstraint

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:41:1`

### Members

| Name   | Kind     | Type                                           | Required | Description |
| ------ | -------- | ---------------------------------------------- | -------- | ----------- |
| kind   | property | `"host" \| "package" \| "node" \| "framework"` | yes      |             |
| name   | property | `string`                                       | yes      |             |
| range  | property | `string`                                       | yes      |             |
| reason | property | `string`                                       | no       |             |

## ApmCompletedMigrationEvidence

Kind: `type`
Module: `src/types/update-validation.ts`
Source: `src/types/update-validation.ts:79:1`

### Members

| Name     | Kind     | Type     | Required | Description |
| -------- | -------- | -------- | -------- | ----------- |
| checksum | property | `string` | yes      |             |
| id       | property | `string` | yes      |             |

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

## ApmExtensionArtifactIdentity

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:11:1`

### Members

| Name             | Kind     | Type                       | Required | Description |
| ---------------- | -------- | -------------------------- | -------- | ----------- |
| descriptorDigest | property | `string`                   | yes      |             |
| integrity        | property | `string`                   | yes      |             |
| packageName      | property | `string`                   | yes      |             |
| role             | property | `ApmMigrationArtifactRole` | yes      |             |
| version          | property | `string`                   | yes      |             |

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

## ApmExtensionExecutionContext

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:19:1`

### Members

| Name          | Kind     | Type                           | Required | Description |
| ------------- | -------- | ------------------------------ | -------- | ----------- |
| artifact      | property | `ApmExtensionArtifactIdentity` | yes      |             |
| owner         | property | `string`                       | yes      |             |
| sourceVersion | property | `string`                       | yes      |             |
| targetVersion | property | `string`                       | yes      |             |

## ApmExtensionInvocationResult

Kind: `unknown`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:131:1`

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

## ApmExtensionProjectReadPort

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:34:1`

### Members

| Name           | Kind     | Type                                                                     | Required | Description |
| -------------- | -------- | ------------------------------------------------------------------------ | -------- | ----------- |
| listFilesAsync | property | `(scope: ApmProjectScope) => Promise<readonly ApmProjectFileSnapshot[]>` | yes      |             |
| readFileAsync  | property | `(path: string) => Promise<ApmProjectFileSnapshot>`                      | yes      |             |

## ApmExtensionProjectWritePort

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:77:1`

### Members

| Name                       | Kind     | Type                                    | Required | Description |
| -------------------------- | -------- | --------------------------------------- | -------- | ----------- |
| applyReviewedMutationAsync | property | `(mutationId: string) => Promise<void>` | yes      |             |

## ApmExtensionVerificationResult

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:81:1`

### Members

| Name     | Kind     | Type                | Required | Description |
| -------- | -------- | ------------------- | -------- | ----------- |
| evidence | property | `readonly string[]` | yes      |             |
| reason   | property | `string`            | no       |             |
| valid    | property | `boolean`           | yes      |             |

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

## ApmJsonValue

Kind: `unknown`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:5:1`

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

## ApmMigrationArtifactRole

Kind: `unknown`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:58:1`

## ApmMigrationDescriptor

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:101:1`

### Members

| Name           | Kind     | Type                                             | Required | Description |
| -------------- | -------- | ------------------------------------------------ | -------- | ----------- |
| affectedScopes | property | `readonly ApmProjectScope[]`                     | yes      |             |
| checksum       | property | `string`                                         | yes      |             |
| from           | property | `ApmMigrationSource`                             | yes      |             |
| id             | property | `string`                                         | yes      |             |
| implementation | property | `ApmMigrationImplementation`                     | yes      |             |
| phase          | property | `"pre-install" \| "post-install"`                | yes      |             |
| prerequisites  | property | `readonly ApmMigrationPrerequisite[]`            | yes      |             |
| recovery       | property | `ApmMigrationRecoveryDescriptor`                 | yes      |             |
| sideEffects    | property | `readonly ApmMigrationSideEffect[]`              | yes      |             |
| to             | property | `ApmMigrationTarget`                             | yes      |             |
| verification   | property | `readonly ApmMigrationVerificationRequirement[]` | yes      |             |

## ApmMigrationExecutionInput

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:106:1`

### Members

| Name       | Kind     | Type                                                         | Required | Description |
| ---------- | -------- | ------------------------------------------------------------ | -------- | ----------- |
| context    | property | `ApmExtensionExecutionContext`                               | yes      |             |
| descriptor | property | `ApmMigrationDescriptor`                                     | yes      |             |
| plan       | property | `ApmMigrationPlanResult`                                     | yes      |             |
| project    | property | `ApmExtensionProjectReadPort & ApmExtensionProjectWritePort` | yes      |             |

## ApmMigrationExecutionInvocation

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:148:1`

### Members

| Name      | Kind     | Type                                                         | Required | Description |
| --------- | -------- | ------------------------------------------------------------ | -------- | ----------- |
| context   | property | `ApmExtensionExecutionContext`                               | yes      |             |
| extension | property | `unknown`                                                    | yes      |             |
| migration | property | `ApmMigrationDescriptor`                                     | yes      |             |
| plan      | property | `ApmMigrationPlanResult`                                     | yes      |             |
| project   | property | `ApmExtensionProjectReadPort & ApmExtensionProjectWritePort` | yes      |             |

## ApmMigrationExecutionResult

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:94:1`

### Members

| Name               | Kind     | Type                | Required | Description |
| ------------------ | -------- | ------------------- | -------- | ----------- |
| appliedMutationIds | property | `readonly string[]` | yes      |             |
| evidence           | property | `readonly string[]` | yes      |             |
| migrationId        | property | `string`            | yes      |             |

## ApmMigrationHandler

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:120:1`

### Members

| Name         | Kind     | Type                                                                                | Required | Description |
| ------------ | -------- | ----------------------------------------------------------------------------------- | -------- | ----------- |
| executeAsync | property | `(input: ApmMigrationExecutionInput) => Promise<ApmMigrationExecutionResult>`       | yes      |             |
| id           | property | `string`                                                                            | yes      |             |
| planAsync    | property | `(input: ApmMigrationPlanInput) => Promise<ApmMigrationPlanResult>`                 | yes      |             |
| verifyAsync  | property | `(input: ApmMigrationVerificationInput) => Promise<ApmExtensionVerificationResult>` | yes      |             |

## ApmMigrationImplementation

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:60:1`

### Members

| Name     | Kind     | Type                       | Required | Description |
| -------- | -------- | -------------------------- | -------- | ----------- |
| artifact | property | `ApmMigrationArtifactRole` | yes      |             |
| version  | property | `string`                   | no       |             |

## ApmMigrationPathInput

Kind: `type`
Module: `src/types/update-validation.ts`
Source: `src/types/update-validation.ts:84:1`

### Members

| Name                | Kind     | Type                                       | Required | Description |
| ------------------- | -------- | ------------------------------------------ | -------- | ----------- |
| completedMigrations | property | `readonly ApmCompletedMigrationEvidence[]` | no       |             |
| descriptor          | property | `ApmUpdateDescriptor`                      | yes      |             |
| sourceStateRevision | property | `string`                                   | no       |             |
| sourceVersion       | property | `string`                                   | yes      |             |
| targetVersion       | property | `string`                                   | yes      |             |

## ApmMigrationPathResult

Kind: `type`
Module: `src/types/update-validation.ts`
Source: `src/types/update-validation.ts:92:1`

### Members

| Name                | Kind     | Type                                  | Required | Description |
| ------------------- | -------- | ------------------------------------- | -------- | ----------- |
| blockers            | property | `readonly ApmUpdateProtocolBlocker[]` | yes      |             |
| migrations          | property | `readonly ApmMigrationDescriptor[]`   | yes      |             |
| noMigrationRequired | property | `boolean`                             | yes      |             |
| supported           | property | `boolean`                             | yes      |             |

## ApmMigrationPlanInput

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:100:1`

### Members

| Name       | Kind     | Type                           | Required | Description |
| ---------- | -------- | ------------------------------ | -------- | ----------- |
| context    | property | `ApmExtensionExecutionContext` | yes      |             |
| descriptor | property | `ApmMigrationDescriptor`       | yes      |             |
| project    | property | `ApmExtensionProjectReadPort`  | yes      |             |

## ApmMigrationPlanInvocation

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:141:1`

### Members

| Name      | Kind     | Type                           | Required | Description |
| --------- | -------- | ------------------------------ | -------- | ----------- |
| context   | property | `ApmExtensionExecutionContext` | yes      |             |
| extension | property | `unknown`                      | yes      |             |
| migration | property | `ApmMigrationDescriptor`       | yes      |             |
| project   | property | `ApmExtensionProjectReadPort`  | yes      |             |

## ApmMigrationPlanResult

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:87:1`

### Members

| Name             | Kind     | Type                            | Required | Description |
| ---------------- | -------- | ------------------------------- | -------- | ----------- |
| evidence         | property | `readonly string[]`             | yes      |             |
| inputFingerprint | property | `string`                        | yes      |             |
| migrationId      | property | `string`                        | yes      |             |
| mutations        | property | `readonly ApmProjectMutation[]` | yes      |             |

## ApmMigrationPrerequisite

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:65:1`

### Members

| Name        | Kind     | Type     | Required | Description |
| ----------- | -------- | -------- | -------- | ----------- |
| migrationId | property | `string` | yes      |             |
| owner       | property | `string` | yes      |             |

## ApmMigrationRecoveryDescriptor

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:94:1`

### Members

| Name               | Kind     | Type      | Required | Description |
| ------------------ | -------- | --------- | -------- | ----------- |
| idempotent         | property | `boolean` | yes      |             |
| restartable        | property | `boolean` | yes      |             |
| reverseMigrationId | property | `string`  | no       |             |
| reversible         | property | `boolean` | yes      |             |

## ApmMigrationSideEffect

Kind: `unknown`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:85:1`

## ApmMigrationSource

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:48:1`

### Members

| Name          | Kind     | Type     | Required | Description |
| ------------- | -------- | -------- | -------- | ----------- |
| packageRange  | property | `string` | yes      |             |
| stateRevision | property | `string` | no       |             |

## ApmMigrationState

Kind: `unknown`
Module: `src/types/status.ts`
Source: `src/types/status.ts:16:1`

## ApmMigrationTarget

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:53:1`

### Members

| Name           | Kind     | Type     | Required | Description |
| -------------- | -------- | -------- | -------- | ----------- |
| packageVersion | property | `string` | yes      |             |
| stateRevision  | property | `string` | no       |             |

## ApmMigrationVerificationInput

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:113:1`

### Members

| Name       | Kind     | Type                           | Required | Description |
| ---------- | -------- | ------------------------------ | -------- | ----------- |
| context    | property | `ApmExtensionExecutionContext` | yes      |             |
| descriptor | property | `ApmMigrationDescriptor`       | yes      |             |
| plan       | property | `ApmMigrationPlanResult`       | yes      |             |
| project    | property | `ApmExtensionProjectReadPort`  | yes      |             |

## ApmMigrationVerificationRequirement

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:88:1`

### Members

| Name        | Kind     | Type                      | Required | Description |
| ----------- | -------- | ------------------------- | -------- | ----------- |
| description | property | `string`                  | yes      |             |
| key         | property | `string`                  | no       |             |
| kind        | property | `"manual" \| "extension"` | yes      |             |

## ApmOtaEligibilityEffect

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:132:1`

### Members

| Name        | Kind     | Type                                        | Required | Description |
| ----------- | -------- | ------------------------------------------- | -------- | ----------- |
| eligibility | property | `"unknown" \| "eligible" \| "not-eligible"` | yes      |             |
| evidence    | property | `readonly string[]`                         | yes      |             |
| kind        | property | `"ota-eligibility"`                         | yes      |             |
| reason      | property | `string`                                    | yes      |             |

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

## ApmPackageUpdateMetadata

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:13:1`

### Members

| Name            | Kind     | Type     | Required | Description |
| --------------- | -------- | -------- | -------- | ----------- |
| descriptor      | property | `string` | yes      |             |
| protocolVersion | property | `1`      | yes      |             |

## ApmPackageUpdateMetadataValidationResult

Kind: `type`
Module: `src/types/update-validation.ts`
Source: `src/types/update-validation.ts:57:1`

### Members

| Name     | Kind     | Type                                  | Required | Description |
| -------- | -------- | ------------------------------------- | -------- | ----------- |
| blockers | property | `readonly ApmUpdateProtocolBlocker[]` | yes      |             |
| metadata | property | `ApmPackageUpdateMetadata`            | no       |             |
| valid    | property | `boolean`                             | yes      |             |

## ApmProjectFileSnapshot

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:26:1`

### Members

| Name     | Kind     | Type                 | Required | Description |
| -------- | -------- | -------------------- | -------- | ----------- |
| content  | property | `string`             | no       |             |
| digest   | property | `string`             | no       |             |
| encoding | property | `"utf8" \| "base64"` | no       |             |
| exists   | property | `boolean`            | yes      |             |
| path     | property | `string`             | yes      |             |

## ApmProjectionDescriptor

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:115:1`

### Members

| Name              | Kind     | Type                         | Required | Description |
| ----------------- | -------- | ---------------------------- | -------- | ----------- |
| claims            | property | `readonly ApmProjectScope[]` | yes      |             |
| id                | property | `string`                     | yes      |             |
| reason            | property | `string`                     | no       |             |
| requiresExtension | property | `boolean`                    | yes      |             |

## ApmProjectionHandler

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:184:1`

### Members

| Name             | Kind     | Type                                                                                | Required | Description |
| ---------------- | -------- | ----------------------------------------------------------------------------------- | -------- | ----------- |
| id               | property | `string`                                                                            | yes      |             |
| inspectAsync     | property | `(input: ApmProjectionInput) => Promise<ApmProjectionInspectionResult>`             | yes      |             |
| materializeAsync | property | `(input: ApmProjectionMaterializeInput) => Promise<void>`                           | yes      |             |
| planAsync        | property | `(input: ApmProjectionInput) => Promise<ApmProjectionPlanResult>`                   | yes      |             |
| verifyAsync      | property | `(input: ApmProjectionMaterializeInput) => Promise<ApmExtensionVerificationResult>` | yes      |             |

## ApmProjectionInput

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:173:1`

### Members

| Name       | Kind     | Type                           | Required | Description |
| ---------- | -------- | ------------------------------ | -------- | ----------- |
| context    | property | `ApmExtensionExecutionContext` | yes      |             |
| descriptor | property | `ApmProjectionDescriptor`      | yes      |             |
| project    | property | `ApmExtensionProjectReadPort`  | yes      |             |

## ApmProjectionInspectionResult

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:156:1`

### Members

| Name                 | Kind     | Type                                | Required | Description |
| -------------------- | -------- | ----------------------------------- | -------- | ----------- |
| evidence             | property | `readonly string[]`                 | yes      |             |
| generatorFingerprint | property | `string`                            | yes      |             |
| inputFingerprint     | property | `string`                            | yes      |             |
| projectionId         | property | `string`                            | yes      |             |
| reason               | property | `string`                            | no       |             |
| state                | property | `"unknown" \| "current" \| "stale"` | yes      |             |

## ApmProjectionMaterializeInput

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:179:1`

### Members

| Name       | Kind     | Type                                                         | Required | Description |
| ---------- | -------- | ------------------------------------------------------------ | -------- | ----------- |
| context    | property | `ApmExtensionExecutionContext`                               | yes      |             |
| descriptor | property | `ApmProjectionDescriptor`                                    | yes      |             |
| plan       | property | `ApmProjectionPlanResult`                                    | yes      |             |
| project    | property | `ApmExtensionProjectReadPort & ApmExtensionProjectWritePort` | yes      |             |

## ApmProjectionPlanResult

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:165:1`

### Members

| Name                 | Kind     | Type                            | Required | Description |
| -------------------- | -------- | ------------------------------- | -------- | ----------- |
| evidence             | property | `readonly string[]`             | yes      |             |
| generatorFingerprint | property | `string`                        | yes      |             |
| inputFingerprint     | property | `string`                        | yes      |             |
| mutations            | property | `readonly ApmProjectMutation[]` | yes      |             |
| projectionId         | property | `string`                        | yes      |             |

## ApmProjectionState

Kind: `unknown`
Module: `src/types/status.ts`
Source: `src/types/status.ts:14:1`

## ApmProjectMutation

Kind: `unknown`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:39:1`

## ApmProjectScope

Kind: `unknown`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:70:1`

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

## ApmReleaseEffect

Kind: `unknown`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:139:1`

## ApmReleaseRequirementEffect

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:125:1`

### Members

| Name        | Kind     | Type                                        | Required | Description |
| ----------- | -------- | ------------------------------------------- | -------- | ----------- |
| evidence    | property | `readonly string[]`                         | yes      |             |
| kind        | property | `ApmReleaseRequirementEffectKind`           | yes      |             |
| reason      | property | `string`                                    | yes      |             |
| requirement | property | `"unknown" \| "required" \| "not-required"` | yes      |             |

## ApmReleaseRequirementEffectKind

Kind: `unknown`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:122:1`

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

## ApmSupportedSourceHistory

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:23:1`

### Members

| Name          | Kind     | Type                            | Required | Description |
| ------------- | -------- | ------------------------------- | -------- | ----------- |
| mode          | property | `"automatic" \| "no-migration"` | yes      |             |
| sourceRange   | property | `string`                        | yes      |             |
| stateRevision | property | `string`                        | no       |             |

## ApmUnsupportedSourceHistory

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:29:1`

### Members

| Name        | Kind     | Type     | Required | Description |
| ----------- | -------- | -------- | -------- | ----------- |
| nextAction  | property | `string` | no       |             |
| reason      | property | `string` | yes      |             |
| sourceRange | property | `string` | yes      |             |

## ApmUpdateDescriptor

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:141:1`

### Members

| Name            | Kind     | Type                                    | Required | Description |
| --------------- | -------- | --------------------------------------- | -------- | ----------- |
| compatibility   | property | `readonly ApmCompatibilityConstraint[]` | yes      |             |
| effects         | property | `readonly ApmReleaseEffect[]`           | yes      |             |
| extension       | property | `{ readonly export: string; }`          | no       |             |
| history         | property | `ApmUpdateHistoryDescriptor`            | yes      |             |
| migrations      | property | `readonly ApmMigrationDescriptor[]`     | yes      |             |
| owner           | property | `ApmUpdateOwnerIdentity`                | yes      |             |
| projections     | property | `readonly ApmProjectionDescriptor[]`    | yes      |             |
| protocolVersion | property | `1`                                     | yes      |             |
| schemaVersion   | property | `1`                                     | yes      |             |

## ApmUpdateDescriptorSchemaVersion

Kind: `unknown`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:3:1`

## ApmUpdateDescriptorValidationInput

Kind: `type`
Module: `src/types/update-validation.ts`
Source: `src/types/update-validation.ts:63:1`

### Members

| Name                | Kind     | Type                                                   | Required | Description |
| ------------------- | -------- | ------------------------------------------------------ | -------- | ----------- |
| descriptor          | property | `unknown`                                              | yes      |             |
| expectedOwner       | property | `{ readonly name: string; readonly version: string; }` | no       |             |
| previousDescriptors | property | `readonly ApmUpdateDescriptor[]`                       | no       |             |
| relatedDescriptors  | property | `readonly ApmUpdateDescriptor[]`                       | no       |             |

## ApmUpdateDescriptorValidationResult

Kind: `type`
Module: `src/types/update-validation.ts`
Source: `src/types/update-validation.ts:73:1`

### Members

| Name       | Kind     | Type                                  | Required | Description |
| ---------- | -------- | ------------------------------------- | -------- | ----------- |
| blockers   | property | `readonly ApmUpdateProtocolBlocker[]` | yes      |             |
| descriptor | property | `ApmUpdateDescriptor`                 | no       |             |
| valid      | property | `boolean`                             | yes      |             |

## ApmUpdateExtension

Kind: `type`
Module: `src/types/update-extension.ts`
Source: `src/types/update-extension.ts:194:1`

### Members

| Name             | Kind     | Type                              | Required | Description |
| ---------------- | -------- | --------------------------------- | -------- | ----------- |
| descriptorDigest | property | `string`                          | yes      |             |
| migrations       | property | `readonly ApmMigrationHandler[]`  | yes      |             |
| projections      | property | `readonly ApmProjectionHandler[]` | yes      |             |
| protocolVersion  | property | `1`                               | yes      |             |

## ApmUpdateHistoryDescriptor

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:35:1`

### Members

| Name        | Kind     | Type                                     | Required | Description |
| ----------- | -------- | ---------------------------------------- | -------- | ----------- |
| downgrade   | property | `"unsupported" \| "manual"`              | yes      |             |
| supported   | property | `readonly ApmSupportedSourceHistory[]`   | yes      |             |
| unsupported | property | `readonly ApmUnsupportedSourceHistory[]` | yes      |             |

## ApmUpdateOwnerIdentity

Kind: `type`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:18:1`

### Members

| Name    | Kind     | Type     | Required | Description |
| ------- | -------- | -------- | -------- | ----------- |
| name    | property | `string` | yes      |             |
| version | property | `string` | yes      |             |

## ApmUpdateProtocolBlocker

Kind: `type`
Module: `src/types/update-validation.ts`
Source: `src/types/update-validation.ts:39:1`

### Members

| Name       | Kind     | Type                                                                                                                                                  | Required | Description |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| code       | property | `ApmUpdateProtocolBlockerCode`                                                                                                                        | yes      |             |
| evidence   | property | `readonly string[]`                                                                                                                                   | yes      |             |
| nextAction | property | `string`                                                                                                                                              | no       |             |
| reason     | property | `string`                                                                                                                                              | yes      |             |
| scope      | property | `{ readonly kind: "package-metadata" \| "descriptor" \| "history" \| "migration" \| "projection" \| "extension" \| "effect"; readonly id?: string; }` | yes      |             |

## ApmUpdateProtocolBlockerCode

Kind: `unknown`
Module: `src/types/update-validation.ts`
Source: `src/types/update-validation.ts:7:1`

## ApmUpdateProtocolVersion

Kind: `unknown`
Module: `src/types/update-protocol.ts`
Source: `src/types/update-protocol.ts:1:1`

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

## resolveMigrationPath

Kind: `function`
Module: `src/features/update-protocol/domain/resolveMigrationPath.ts`
Source: `src/features/update-protocol/domain/resolveMigrationPath.ts:16:1`

Resolve one complete deterministic owner migration path for an exact source and target.

### Signatures

- `(input: ApmMigrationPathInput) => ApmMigrationPathResult`
  - input: `ApmMigrationPathInput`
  - returns: `ApmMigrationPathResult`

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

## validatePackageUpdateMetadata

Kind: `function`
Module: `src/features/update-protocol/domain/validatePackageUpdateMetadata.ts`
Source: `src/features/update-protocol/domain/validatePackageUpdateMetadata.ts:8:1`

Validate package.json `ankhorage.apm` discovery metadata before descriptor loading.

### Signatures

- `(value: unknown) => ApmPackageUpdateMetadataValidationResult`
  - value: `unknown`
  - returns: `ApmPackageUpdateMetadataValidationResult`

## validateUpdateDescriptor

Kind: `function`
Module: `src/features/update-protocol/domain/validateUpdateDescriptor.ts`
Source: `src/features/update-protocol/domain/validateUpdateDescriptor.ts:19:1`

Validate unknown static package metadata and all canonical update-protocol invariants.

### Signatures

- `(input: ApmUpdateDescriptorValidationInput) => ApmUpdateDescriptorValidationResult`
  - input: `ApmUpdateDescriptorValidationInput`
  - returns: `ApmUpdateDescriptorValidationResult`

## validateUpdateExtensionBinding

Kind: `function`
Module: `src/features/update-protocol/domain/validateUpdateExtensionBinding.ts`
Source: `src/features/update-protocol/domain/validateUpdateExtensionBinding.ts:9:1`

Validate loaded owner code against the exact immutable artifact identity selected by APM.

### Signatures

- `(artifact: ApmExtensionArtifactIdentity, extension: unknown) => readonly ApmUpdateProtocolBlocker[]`
  - artifact: `ApmExtensionArtifactIdentity`
  - extension: `unknown`
  - returns: `readonly ApmUpdateProtocolBlocker[]`

## validateUpdateExtensionCapabilities

Kind: `function`
Module: `src/features/update-protocol/domain/validateUpdateExtensionCapabilities.ts`
Source: `src/features/update-protocol/domain/validateUpdateExtensionCapabilities.ts:13:1`

Validate only the handlers required from the selected source/target/intermediate artifact.

### Signatures

- `(descriptor: ApmUpdateDescriptor, artifact: ApmExtensionArtifactIdentity, extension: ApmUpdateExtension) => readonly ApmUpdateProtocolBlocker[]`
  - artifact: `ApmExtensionArtifactIdentity`
  - descriptor: `ApmUpdateDescriptor`
  - extension: `ApmUpdateExtension`
  - returns: `readonly ApmUpdateProtocolBlocker[]`

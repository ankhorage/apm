# Public API

## APM_PLAN_SUPPORT

Kind: `value`
Module: `src/features/plan/constants/support.ts`
Source: `src/features/plan/constants/support.ts:34:14`

Publish the deterministic planning guarantees and native resolver matrix implemented by APM.

`plan` is read-only with respect to the inspected project. Package-manager resolution runs in a
disposable staging directory and uses the selected project's native npm, pnpm, Yarn, or Bun
resolver. Lifecycle scripts are disabled. Only reviewed manifest and lockfile changes are returned
as serializable plan evidence; staging/cache/network effects remain outside the project tree.

The default dependency policy is conservative: only direct registry packages with a newer version
satisfying their existing declared range are selected automatically. Latest majors, prereleases,
downgrades and exact versions require explicit selections and APM never invents a new caret range.
Explicit transitive selections remain lock-only; they are not promoted into root dependencies.

Native solver output is re-inspected through the same package-manager evidence adapters used by
`status`. Duplicate package instances, peer contexts and workspace links keep their native identity.
Unknown artifact sources, peer conflicts, unsupported lock/linker modes and unresolved targets are
blockers rather than partial executable plans.

Package-owned migration/projection planners can request additional dependency selections. APM
resolves those through a bounded fixed-point loop (four iterations by default). Conflicting owner
requirements or non-convergence block the plan, and intermediate diffs are never exposed as an
executable result. Required host/extension upgrades are explicit restart-and-re-plan boundaries.

Saved plans contain exact targets, reviewed file content/digests, resolved graph/artifact identities,
ordered step prerequisites, executor identity and a semantic input fingerprint. Registry freshness
timestamps are recorded separately from fingerprint validity: refreshing identical registry evidence
does not invalidate an otherwise identical plan. Apply must revalidate the project fingerprint and
executor instead of re-resolving `latest`.

Shipment effects remain separate from source updates. In particular, dependency graph changes are
never assumed OTA-safe; without package/platform evidence APM records OTA eligibility as `unknown`.

## APM_STATUS_SUPPORT

Kind: `value`
Module: `src/features/status/constants/support.ts`
Source: `src/features/status/constants/support.ts:47:14`

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

`status` and `plan` are read-only project operations. Status reads manifests, lockfiles,
installation metadata and registry data. Plan performs package-manager-native resolution only in
disposable staging and returns reviewed diffs without writing the inspected project. Neither
operation executes project lifecycle hooks or migrations. `apply` and `verify` remain separate
roadmap operations.

## ApmApplyBlocker

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:118:1`

### Members

| Name       | Kind     | Type                                                                                                             | Required | Description |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| code       | property | `ApmApplyBlockerCode`                                                                                            | yes      |             |
| evidence   | property | `readonly string[]`                                                                                              | yes      |             |
| nextAction | property | `string`                                                                                                         | no       |             |
| reason     | property | `string`                                                                                                         | yes      |             |
| scope      | property | `{ readonly kind: "project" \| "operation" \| "step" \| "host"; readonly id?: string; readonly path?: string; }` | yes      |             |

## ApmApplyBlockerCode

Kind: `unknown`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:103:1`

## ApmApplyCancellationPort

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:205:1`

### Members

| Name                         | Kind     | Type                                        | Required | Description |
| ---------------------------- | -------- | ------------------------------------------- | -------- | ----------- |
| isCancellationRequestedAsync | property | `(operationId: string) => Promise<boolean>` | yes      |             |

## ApmApplyClockPort

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:130:1`

### Members

| Name   | Kind     | Type           | Required | Description |
| ------ | -------- | -------------- | -------- | ----------- |
| nowIso | property | `() => string` | yes      |             |

## ApmApplyExecutorIdentityPort

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:175:1`

### Members

| Name    | Kind     | Type                            | Required | Description |
| ------- | -------- | ------------------------------- | -------- | ----------- |
| current | property | `() => ApmPlanExecutorIdentity` | yes      |             |

## ApmApplyFailure

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:41:1`

### Members

| Name       | Kind     | Type                | Required | Description |
| ---------- | -------- | ------------------- | -------- | ----------- |
| code       | property | `string`            | yes      |             |
| evidence   | property | `readonly string[]` | yes      |             |
| nextAction | property | `string`            | no       |             |
| reason     | property | `string`            | yes      |             |

## ApmApplyInput

Kind: `unknown`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:15:1`

## ApmApplyJournal

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:57:1`

### Members

| Name          | Kind     | Type                             | Required | Description |
| ------------- | -------- | -------------------------------- | -------- | ----------- |
| createdAt     | property | `string`                         | yes      |             |
| failure       | property | `ApmApplyFailure`                | no       |             |
| operationId   | property | `string`                         | yes      |             |
| permissions   | property | `ApmApplyPermissions`            | yes      |             |
| plan          | property | `ApmPlanResult`                  | yes      |             |
| rootPath      | property | `string`                         | yes      |             |
| schemaVersion | property | `1`                              | yes      |             |
| status        | property | `ApmApplyJournalStatus`          | yes      |             |
| steps         | property | `readonly ApmApplyStepJournal[]` | yes      |             |
| updatedAt     | property | `string`                         | yes      |             |

## ApmApplyJournalPort

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:154:1`

### Members

| Name        | Kind     | Type                                                                               | Required | Description |
| ----------- | -------- | ---------------------------------------------------------------------------------- | -------- | ----------- |
| createAsync | property | `(journal: ApmApplyJournal) => Promise<void>`                                      | yes      |             |
| readAsync   | property | `(rootPath: string, operationId: string) => Promise<ApmApplyJournal \| undefined>` | yes      |             |
| writeAsync  | property | `(journal: ApmApplyJournal) => Promise<void>`                                      | yes      |             |

## ApmApplyJournalStatus

Kind: `unknown`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:28:1`

## ApmApplyLockAcquireResult

Kind: `unknown`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:79:1`

## ApmApplyLockIdentity

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:70:1`

### Members

| Name          | Kind     | Type     | Required | Description |
| ------------- | -------- | -------- | -------- | ----------- |
| acquiredAt    | property | `string` | yes      |             |
| hostname      | property | `string` | yes      |             |
| operationId   | property | `string` | yes      |             |
| pid           | property | `number` | yes      |             |
| planId        | property | `string` | yes      |             |
| schemaVersion | property | `1`      | yes      |             |

## ApmApplyLockPort

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:138:1`

### Members

| Name              | Kind     | Type                                                                                                                                                                         | Required | Description |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| acquireAsync      | property | `(input: { readonly rootPath: string; readonly operationId: string; readonly planId: string; readonly resume: boolean; }) => Promise<ApmApplyLockAcquireResult>`             | yes      |             |
| recoverStaleAsync | property | `(input: { readonly rootPath: string; readonly operationId: string; readonly planId: string; readonly stale: ApmApplyLockIdentity; }) => Promise<ApmApplyLockAcquireResult>` | yes      |             |
| releaseAsync      | property | `(rootPath: string, operationId: string) => Promise<void>`                                                                                                                   | yes      |             |

## ApmApplyOperationIdPort

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:134:1`

### Members

| Name              | Kind     | Type           | Required | Description |
| ----------------- | -------- | -------------- | -------- | ----------- |
| createOperationId | property | `() => string` | yes      |             |

## ApmApplyPermissions

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:9:1`

### Members

| Name             | Kind     | Type      | Required | Description |
| ---------------- | -------- | --------- | -------- | ----------- |
| externalEffects  | property | `boolean` | yes      |             |
| lifecycleScripts | property | `boolean` | yes      |             |
| ownerCode        | property | `boolean` | yes      |             |

## ApmApplyPlanValidationPort

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:167:1`

### Members

| Name          | Kind     | Type                                                                                                                                                             | Required | Description |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| validateAsync | property | `(input: { readonly plan: ApmPlanResult; readonly status: ApmStatusResult; readonly executor: ApmPlanExecutorIdentity; }) => Promise<readonly ApmPlanBlocker[]>` | yes      |             |

## ApmApplyPorts

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:209:1`

### Members

| Name           | Kind     | Type                           | Required | Description |
| -------------- | -------- | ------------------------------ | -------- | ----------- |
| cancellation   | property | `ApmApplyCancellationPort`     | no       |             |
| clock          | property | `ApmApplyClockPort`            | yes      |             |
| executor       | property | `ApmApplyExecutorIdentityPort` | yes      |             |
| journal        | property | `ApmApplyJournalPort`          | yes      |             |
| lock           | property | `ApmApplyLockPort`             | yes      |             |
| operationId    | property | `ApmApplyOperationIdPort`      | yes      |             |
| planValidation | property | `ApmApplyPlanValidationPort`   | yes      |             |
| progress       | property | `ApmApplyProgressPort`         | no       |             |
| status         | property | `ApmApplyStatusPort`           | yes      |             |
| step           | property | `ApmApplyStepPort`             | yes      |             |

## ApmApplyProgressEvent

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:194:1`

### Members

| Name        | Kind     | Type                                                                                                                                                            | Required | Description |
| ----------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| message     | property | `string`                                                                                                                                                        | yes      |             |
| operationId | property | `string`                                                                                                                                                        | yes      |             |
| state       | property | `"pending" \| "intended" \| "effect-started" \| "effect-observed" \| "committed" \| "failed" \| "cancelled" \| "recovery-required" \| "running" \| "completed"` | yes      |             |
| stepId      | property | `string`                                                                                                                                                        | no       |             |

## ApmApplyProgressPort

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:201:1`

### Members

| Name         | Kind     | Type                                              | Required | Description |
| ------------ | -------- | ------------------------------------------------- | -------- | ----------- |
| publishAsync | property | `(event: ApmApplyProgressEvent) => Promise<void>` | yes      |             |

## ApmApplyResult

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:225:1`

### Members

| Name          | Kind     | Type                             | Required | Description |
| ------------- | -------- | -------------------------------- | -------- | ----------- |
| blockers      | property | `readonly ApmApplyBlocker[]`     | yes      |             |
| complete      | property | `boolean`                        | yes      |             |
| diagnostics   | property | `readonly ApmStatusDiagnostic[]` | yes      |             |
| journal       | property | `ApmApplyJournal`                | no       |             |
| operation     | property | `"apply"`                        | yes      |             |
| operationId   | property | `string`                         | yes      |             |
| planId        | property | `string`                         | no       |             |
| rootPath      | property | `string`                         | yes      |             |
| schemaVersion | property | `1`                              | yes      |             |
| status        | property | `ApmApplyResultStatus`           | yes      |             |

## ApmApplyResultStatus

Kind: `unknown`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:222:1`

## ApmApplyStatusPort

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:163:1`

### Members

| Name               | Kind     | Type                                             | Required | Description |
| ------------------ | -------- | ------------------------------------------------ | -------- | ----------- |
| inspectStatusAsync | property | `(rootPath: string) => Promise<ApmStatusResult>` | yes      |             |

## ApmApplyStepExecutionResult

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:96:1`

### Members

| Name        | Kind     | Type                                   | Required | Description |
| ----------- | -------- | -------------------------------------- | -------- | ----------- |
| diagnostics | property | `readonly ApmStatusDiagnostic[]`       | yes      |             |
| evidence    | property | `readonly string[]`                    | yes      |             |
| failure     | property | `ApmApplyFailure`                      | no       |             |
| state       | property | `"unknown" \| "failed" \| "completed"` | yes      |             |

## ApmApplyStepJournal

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:48:1`

### Members

| Name      | Kind     | Type                | Required | Description |
| --------- | -------- | ------------------- | -------- | ----------- |
| attempts  | property | `number`            | yes      |             |
| evidence  | property | `readonly string[]` | yes      |             |
| failure   | property | `ApmApplyFailure`   | no       |             |
| state     | property | `ApmApplyStepState` | yes      |             |
| stepId    | property | `string`            | yes      |             |
| updatedAt | property | `string`            | yes      |             |

## ApmApplyStepObservation

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:90:1`

### Members

| Name     | Kind     | Type                                                  | Required | Description |
| -------- | -------- | ----------------------------------------------------- | -------- | ----------- |
| evidence | property | `readonly string[]`                                   | yes      |             |
| reason   | property | `string`                                              | no       |             |
| state    | property | `"unknown" \| "pending" \| "conflict" \| "satisfied"` | yes      |             |

## ApmApplyStepPort

Kind: `type`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:179:1`

### Members

| Name          | Kind     | Type                                                                                                                  | Required | Description |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| executeAsync  | property | `(input: { readonly journal: ApmApplyJournal; readonly step: ApmPlanStep; }) => Promise<ApmApplyStepExecutionResult>` | yes      |             |
| observeAsync  | property | `(input: { readonly journal: ApmApplyJournal; readonly step: ApmPlanStep; }) => Promise<ApmApplyStepObservation>`     | yes      |             |
| rollbackAsync | property | `(input: { readonly journal: ApmApplyJournal; readonly step: ApmPlanStep; }) => Promise<ApmApplyStepExecutionResult>` | yes      |             |

## ApmApplyStepState

Kind: `unknown`
Module: `src/types/apply.ts`
Source: `src/types/apply.ts:31:1`

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

## ApmPlanArtifactIdentity

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:121:1`

### Members

| Name        | Kind     | Type                                           | Required | Description |
| ----------- | -------- | ---------------------------------------------- | -------- | ----------- |
| id          | property | `string`                                       | yes      |             |
| integrity   | property | `string`                                       | no       |             |
| packageName | property | `string`                                       | yes      |             |
| resolved    | property | `string`                                       | no       |             |
| source      | property | `"registry" \| "workspace" \| "file" \| "git"` | yes      |             |
| version     | property | `string`                                       | no       |             |

## ApmPlanBlocker

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:84:1`

### Members

| Name       | Kind     | Type                                         | Required | Description |
| ---------- | -------- | -------------------------------------------- | -------- | ----------- |
| code       | property | `ApmPlanBlockerCode \| `protocol.${string}`` | yes      |             |
| evidence   | property | `readonly string[]`                          | yes      |             |
| nextAction | property | `string`                                     | no       |             |
| reason     | property | `string`                                     | yes      |             |
| scope      | property | `ApmPlanBlockerScope`                        | yes      |             |

## ApmPlanBlockerCode

Kind: `unknown`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:56:1`

## ApmPlanBlockerScope

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:78:1`

### Members

| Name | Kind     | Type                                                                                | Required | Description |
| ---- | -------- | ----------------------------------------------------------------------------------- | -------- | ----------- |
| id   | property | `string`                                                                            | no       |             |
| kind | property | `"host" \| "project" \| "install-root" \| "package" \| "projection" \| "migration"` | yes      |             |
| path | property | `string`                                                                            | no       |             |

## ApmPlanDependencyTarget

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:92:1`

### Members

| Name           | Kind     | Type                                                                       | Required | Description |
| -------------- | -------- | -------------------------------------------------------------------------- | -------- | ----------- |
| currentRange   | property | `string`                                                                   | no       |             |
| currentVersion | property | `string`                                                                   | no       |             |
| direct         | property | `boolean`                                                                  | yes      |             |
| installRootId  | property | `string`                                                                   | yes      |             |
| kind           | property | `"dependency" \| "development" \| "optional" \| "peer" \| "peer-optional"` | no       |             |
| name           | property | `string`                                                                   | yes      |             |
| ownerPath      | property | `string`                                                                   | no       |             |
| packageId      | property | `string`                                                                   | yes      |             |
| reason         | property | `string`                                                                   | yes      |             |
| source         | property | `"compatible" \| "latest" \| "exact"`                                      | yes      |             |
| targetRange    | property | `string`                                                                   | no       |             |
| targetVersion  | property | `string`                                                                   | yes      |             |

## ApmPlanDependencyUpdateMode

Kind: `unknown`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:11:1`

## ApmPlanDigestPort

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:196:1`

### Members

| Name        | Kind     | Type                                 | Required | Description |
| ----------- | -------- | ------------------------------------ | -------- | ----------- |
| digestAsync | property | `(value: string) => Promise<string>` | yes      |             |

## ApmPlanExecutorIdentity

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:178:1`

### Members

| Name           | Kind     | Type                             | Required | Description |
| -------------- | -------- | -------------------------------- | -------- | ----------- |
| apmVersion     | property | `string`                         | yes      |             |
| runtime        | property | `"node" \| "browser" \| "other"` | yes      |             |
| runtimeVersion | property | `string`                         | no       |             |

## ApmPlanFileChange

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:112:1`

### Members

| Name          | Kind     | Type                               | Required | Description |
| ------------- | -------- | ---------------------------------- | -------- | ----------- |
| afterContent  | property | `string`                           | no       |             |
| afterDigest   | property | `string`                           | no       |             |
| beforeContent | property | `string`                           | no       |             |
| beforeDigest  | property | `string`                           | no       |             |
| kind          | property | `"create" \| "update" \| "delete"` | yes      |             |
| path          | property | `string`                           | yes      |             |

## ApmPlanInput

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:184:1`

### Members

| Name     | Kind     | Type                      | Required | Description |
| -------- | -------- | ------------------------- | -------- | ----------- |
| executor | property | `ApmPlanExecutorIdentity` | yes      |             |
| policy   | property | `ApmPlanPolicyInput`      | no       |             |
| status   | property | `ApmStatusResult`         | yes      |             |

## ApmPlanInputFingerprint

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:200:1`

### Members

| Name                  | Kind     | Type                | Required | Description |
| --------------------- | -------- | ------------------- | -------- | ----------- |
| availabilityCheckedAt | property | `readonly string[]` | yes      |             |
| statusSchemaVersion   | property | `number`            | yes      |             |
| value                 | property | `string`            | yes      |             |

## ApmPlanPackageSelection

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:35:1`

### Members

| Name     | Kind     | Type                     | Required | Description |
| -------- | -------- | ------------------------ | -------- | ----------- |
| selector | property | `ApmPlanPackageSelector` | yes      |             |
| target   | property | `ApmPlanTargetSelection` | yes      |             |

## ApmPlanPackageSelector

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:13:1`

### Members

| Name          | Kind     | Type     | Required | Description |
| ------------- | -------- | -------- | -------- | ----------- |
| installRootId | property | `string` | no       |             |
| name          | property | `string` | yes      |             |
| ownerPath     | property | `string` | no       |             |
| packageId     | property | `string` | no       |             |

## ApmPlanPolicy

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:48:1`

### Members

| Name                   | Kind     | Type                                 | Required | Description |
| ---------------------- | -------- | ------------------------------------ | -------- | ----------- |
| dependencyUpdates      | property | `ApmPlanDependencyUpdateMode`        | yes      |             |
| maxGeneratorIterations | property | `number`                             | yes      |             |
| repairInstallations    | property | `boolean`                            | yes      |             |
| repairProjections      | property | `boolean`                            | yes      |             |
| selections             | property | `readonly ApmPlanPackageSelection[]` | yes      |             |

## ApmPlanPolicyInput

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:40:1`

### Members

| Name                   | Kind     | Type                                 | Required | Description |
| ---------------------- | -------- | ------------------------------------ | -------- | ----------- |
| dependencyUpdates      | property | `ApmPlanDependencyUpdateMode`        | no       |             |
| maxGeneratorIterations | property | `number`                             | no       |             |
| repairInstallations    | property | `boolean`                            | no       |             |
| repairProjections      | property | `boolean`                            | no       |             |
| selections             | property | `readonly ApmPlanPackageSelection[]` | no       |             |

## ApmPlanPorts

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:252:1`

### Members

| Name       | Kind     | Type                    | Required | Description |
| ---------- | -------- | ----------------------- | -------- | ----------- |
| digest     | property | `ApmPlanDigestPort`     | yes      |             |
| protocol   | property | `ApmPlanProtocolPort`   | no       |             |
| resolution | property | `ApmPlanResolutionPort` | yes      |             |

## ApmPlanProjectInput

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:190:1`

### Members

| Name         | Kind     | Type                        | Required | Description |
| ------------ | -------- | --------------------------- | -------- | ----------- |
| availability | property | `ApmStatusAvailabilityMode` | no       |             |
| policy       | property | `ApmPlanPolicyInput`        | no       |             |
| rootPath     | property | `string`                    | yes      |             |

## ApmPlanProjectOptions

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:248:1`

### Members

| Name     | Kind     | Type                  | Required | Description |
| -------- | -------- | --------------------- | -------- | ----------- |
| protocol | property | `ApmPlanProtocolPort` | no       |             |

## ApmPlanProtocolPort

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:244:1`

### Members

| Name              | Kind     | Type                                                                | Required | Description |
| ----------------- | -------- | ------------------------------------------------------------------- | -------- | ----------- |
| planProtocolAsync | property | `(input: ApmPlanProtocolRequest) => Promise<ApmPlanProtocolResult>` | yes      |             |

## ApmPlanProtocolRequest

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:224:1`

### Members

| Name             | Kind     | Type                                 | Required | Description |
| ---------------- | -------- | ------------------------------------ | -------- | ----------- |
| inputFingerprint | property | `ApmPlanInputFingerprint`            | yes      |             |
| policy           | property | `ApmPlanPolicy`                      | yes      |             |
| resolutions      | property | `readonly ApmPlanResolutionResult[]` | yes      |             |
| status           | property | `ApmStatusResult`                    | yes      |             |
| targets          | property | `readonly ApmPlanDependencyTarget[]` | yes      |             |

## ApmPlanProtocolResult

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:232:1`

### Members

| Name               | Kind     | Type                                 | Required | Description |
| ------------------ | -------- | ------------------------------------ | -------- | ----------- |
| artifacts          | property | `readonly ApmPlanArtifactIdentity[]` | yes      |             |
| blockers           | property | `readonly ApmPlanBlocker[]`          | yes      |             |
| complete           | property | `boolean`                            | yes      |             |
| diagnostics        | property | `readonly ApmStatusDiagnostic[]`     | yes      |             |
| effects            | property | `readonly ApmReleaseEffect[]`        | yes      |             |
| files              | property | `readonly ApmPlanFileChange[]`       | yes      |             |
| findings           | property | `readonly ApmStatusFinding[]`        | yes      |             |
| requiredSelections | property | `readonly ApmPlanPackageSelection[]` | yes      |             |
| steps              | property | `readonly ApmPlanStep[]`             | yes      |             |

## ApmPlanResolutionEffects

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:153:1`

### Members

| Name             | Kind     | Type                              | Required | Description |
| ---------------- | -------- | --------------------------------- | -------- | ----------- |
| cache            | property | `"manager-default" \| "isolated"` | yes      |             |
| lifecycleScripts | property | `false`                           | yes      |             |
| network          | property | `"offline" \| "allowed"`          | yes      |             |
| projectWrites    | property | `false`                           | yes      |             |

## ApmPlanResolutionPort

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:174:1`

### Members

| Name         | Kind     | Type                                                                    | Required | Description |
| ------------ | -------- | ----------------------------------------------------------------------- | -------- | ----------- |
| resolveAsync | property | `(input: ApmPlanResolutionRequest) => Promise<ApmPlanResolutionResult>` | yes      |             |

## ApmPlanResolutionRequest

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:141:1`

### Members

| Name            | Kind     | Type                                 | Required | Description |
| --------------- | -------- | ------------------------------------ | -------- | ----------- |
| installRootId   | property | `string`                             | yes      |             |
| installRootPath | property | `string`                             | yes      |             |
| linker          | property | `string`                             | no       |             |
| lockfilePath    | property | `string`                             | no       |             |
| manager         | property | `ApmPackageManagerName`              | yes      |             |
| managerVersion  | property | `string`                             | no       |             |
| packagePaths    | property | `readonly string[]`                  | yes      |             |
| rootPath        | property | `string`                             | yes      |             |
| targets         | property | `readonly ApmPlanDependencyTarget[]` | yes      |             |

## ApmPlanResolutionResult

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:160:1`

### Members

| Name           | Kind     | Type                                 | Required | Description |
| -------------- | -------- | ------------------------------------ | -------- | ----------- |
| artifacts      | property | `readonly ApmPlanArtifactIdentity[]` | yes      |             |
| blockers       | property | `readonly ApmPlanBlocker[]`          | yes      |             |
| complete       | property | `boolean`                            | yes      |             |
| diagnostics    | property | `readonly ApmStatusDiagnostic[]`     | yes      |             |
| effects        | property | `ApmPlanResolutionEffects`           | yes      |             |
| files          | property | `readonly ApmPlanFileChange[]`       | yes      |             |
| installRootId  | property | `string`                             | yes      |             |
| linker         | property | `string`                             | no       |             |
| manager        | property | `ApmPackageManagerName`              | yes      |             |
| managerVersion | property | `string`                             | no       |             |
| packages       | property | `readonly ApmPlanResolvedPackage[]`  | yes      |             |

## ApmPlanResolvedPackage

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:130:1`

### Members

| Name         | Kind     | Type                                           | Required | Description |
| ------------ | -------- | ---------------------------------------------- | -------- | ----------- |
| dependencies | property | `readonly string[]`                            | yes      |             |
| direct       | property | `boolean`                                      | yes      |             |
| id           | property | `string`                                       | yes      |             |
| integrity    | property | `string`                                       | no       |             |
| name         | property | `string`                                       | yes      |             |
| peerContext  | property | `string`                                       | no       |             |
| source       | property | `"registry" \| "workspace" \| "file" \| "git"` | yes      |             |
| version      | property | `string`                                       | no       |             |

## ApmPlanResult

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:258:1`

### Members

| Name             | Kind     | Type                                 | Required | Description |
| ---------------- | -------- | ------------------------------------ | -------- | ----------- |
| artifacts        | property | `readonly ApmPlanArtifactIdentity[]` | yes      |             |
| blockers         | property | `readonly ApmPlanBlocker[]`          | yes      |             |
| complete         | property | `boolean`                            | yes      |             |
| diagnostics      | property | `readonly ApmStatusDiagnostic[]`     | yes      |             |
| effects          | property | `readonly ApmReleaseEffect[]`        | yes      |             |
| executor         | property | `ApmPlanExecutorIdentity`            | yes      |             |
| files            | property | `readonly ApmPlanFileChange[]`       | yes      |             |
| findings         | property | `readonly ApmStatusFinding[]`        | yes      |             |
| id               | property | `string`                             | yes      |             |
| inputFingerprint | property | `ApmPlanInputFingerprint`            | yes      |             |
| operation        | property | `"plan"`                             | yes      |             |
| packages         | property | `readonly ApmPlanResolvedPackage[]`  | yes      |             |
| policy           | property | `ApmPlanPolicy`                      | yes      |             |
| rootPath         | property | `string`                             | yes      |             |
| schemaVersion    | property | `2`                                  | yes      |             |
| steps            | property | `readonly ApmPlanStep[]`             | yes      |             |
| targets          | property | `readonly ApmPlanDependencyTarget[]` | yes      |             |

## ApmPlanStep

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:206:1`

### Members

| Name          | Kind     | Type                                                                                                              | Required | Description |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| evidence      | property | `readonly string[]`                                                                                               | yes      |             |
| execution     | property | `ApmPlanStepExecution`                                                                                            | yes      |             |
| id            | property | `string`                                                                                                          | yes      |             |
| installRootId | property | `string`                                                                                                          | no       |             |
| kind          | property | `"projection" \| "migration" \| "dependency-files" \| "install" \| "validation" \| "host-restart" \| "follow-up"` | yes      |             |
| owner         | property | `string`                                                                                                          | no       |             |
| prerequisites | property | `readonly string[]`                                                                                               | yes      |             |
| reason        | property | `string`                                                                                                          | yes      |             |

## ApmPlanStepExecution

Kind: `unknown`
Module: `src/types/plan-execution.ts`
Source: `src/types/plan-execution.ts:27:1`

## ApmPlanTargetSelection

Kind: `unknown`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:20:1`

## ApmPlanTargetSelectionResult

Kind: `type`
Module: `src/types/plan.ts`
Source: `src/types/plan.ts:107:1`

### Members

| Name     | Kind     | Type                                 | Required | Description |
| -------- | -------- | ------------------------------------ | -------- | ----------- |
| blockers | property | `readonly ApmPlanBlocker[]`          | yes      |             |
| targets  | property | `readonly ApmPlanDependencyTarget[]` | yes      |             |

## ApmPlanValidationCheck

Kind: `unknown`
Module: `src/types/plan-execution.ts`
Source: `src/types/plan-execution.ts:13:1`

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

## ApmVerifyCheckKind

Kind: `unknown`
Module: `src/types/verify.ts`
Source: `src/types/verify.ts:13:1`

## ApmVerifyCheckResult

Kind: `type`
Module: `src/types/verify.ts`
Source: `src/types/verify.ts:16:1`

### Members

| Name       | Kind     | Type                   | Required | Description |
| ---------- | -------- | ---------------------- | -------- | ----------- |
| evidence   | property | `readonly string[]`    | yes      |             |
| id         | property | `string`               | yes      |             |
| kind       | property | `ApmVerifyCheckKind`   | yes      |             |
| nextAction | property | `string`               | no       |             |
| reason     | property | `string`               | no       |             |
| status     | property | `ApmVerifyCheckStatus` | yes      |             |

## ApmVerifyCheckStatus

Kind: `unknown`
Module: `src/types/verify.ts`
Source: `src/types/verify.ts:11:1`

## ApmVerifyInput

Kind: `type`
Module: `src/types/verify.ts`
Source: `src/types/verify.ts:6:1`

### Members

| Name        | Kind     | Type     | Required | Description |
| ----------- | -------- | -------- | -------- | ----------- |
| operationId | property | `string` | yes      |             |
| rootPath    | property | `string` | yes      |             |

## ApmVerifyJournalPort

Kind: `type`
Module: `src/types/verify.ts`
Source: `src/types/verify.ts:25:1`

### Members

| Name      | Kind     | Type                                                                               | Required | Description |
| --------- | -------- | ---------------------------------------------------------------------------------- | -------- | ----------- |
| readAsync | property | `(rootPath: string, operationId: string) => Promise<ApmApplyJournal \| undefined>` | yes      |             |

## ApmVerifyPorts

Kind: `type`
Module: `src/types/verify.ts`
Source: `src/types/verify.ts:44:1`

### Members

| Name    | Kind     | Type                   | Required | Description |
| ------- | -------- | ---------------------- | -------- | ----------- |
| journal | property | `ApmVerifyJournalPort` | yes      |             |
| status  | property | `ApmVerifyStatusPort`  | yes      |             |
| step    | property | `ApmVerifyStepPort`    | yes      |             |

## ApmVerifyResult

Kind: `type`
Module: `src/types/verify.ts`
Source: `src/types/verify.ts:50:1`

### Members

| Name          | Kind     | Type                              | Required | Description |
| ------------- | -------- | --------------------------------- | -------- | ----------- |
| checks        | property | `readonly ApmVerifyCheckResult[]` | yes      |             |
| diagnostics   | property | `readonly ApmStatusDiagnostic[]`  | yes      |             |
| findings      | property | `readonly ApmStatusFinding[]`     | yes      |             |
| followUp      | property | `readonly ApmReleaseEffect[]`     | yes      |             |
| operation     | property | `"verify"`                        | yes      |             |
| operationId   | property | `string`                          | yes      |             |
| planId        | property | `string`                          | no       |             |
| rootPath      | property | `string`                          | yes      |             |
| schemaVersion | property | `1`                               | yes      |             |
| verified      | property | `boolean`                         | yes      |             |

## ApmVerifyStatusPort

Kind: `type`
Module: `src/types/verify.ts`
Source: `src/types/verify.ts:32:1`

### Members

| Name               | Kind     | Type                                             | Required | Description |
| ------------------ | -------- | ------------------------------------------------ | -------- | ----------- |
| inspectStatusAsync | property | `(rootPath: string) => Promise<ApmStatusResult>` | yes      |             |

## ApmVerifyStepPort

Kind: `type`
Module: `src/types/verify.ts`
Source: `src/types/verify.ts:36:1`

### Members

| Name        | Kind     | Type                                                                                                                                                   | Required | Description |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------- |
| verifyAsync | property | `(input: { readonly plan: ApmPlanResult; readonly step: ApmPlanStep; readonly status: ApmStatusResult; }) => Promise<readonly ApmVerifyCheckResult[]>` | yes      |             |

## createCliProvider

Kind: `function`
Module: `src/cli/createCliProvider.ts`
Source: `src/cli/createCliProvider.ts:10:1`

Create the thin Ankh command provider over the same standalone APM command adapter.

### Signatures

- `(version: string) => AnkhRuntimeCommandProvider`
  - version: `string`
  - returns: `AnkhRuntimeCommandProvider`

## createNativePlanResolutionPort

Kind: `function`
Module: `src/features/plan/adapters/outbound/createNativePlanResolutionPort.ts`
Source: `src/features/plan/adapters/outbound/createNativePlanResolutionPort.ts:24:1`

Create the Node native package-manager resolution adapter used by headless project planning.

### Signatures

- `() => ApmPlanResolutionPort`
  - returns: `ApmPlanResolutionPort`

## createNpmRegistryAvailabilityPort

Kind: `function`
Module: `src/features/status/adapters/outbound/createNpmRegistryAvailabilityPort.ts`
Source: `src/features/status/adapters/outbound/createNpmRegistryAvailabilityPort.ts:19:1`

Create a bounded npm-compatible registry adapter with redacted config and process-local TTL cache.

### Signatures

- `(options?: ApmRegistryAvailabilityOptions) => ApmStatusAvailabilityPort`
  - options: `ApmRegistryAvailabilityOptions` (optional)
  - returns: `ApmStatusAvailabilityPort`

## createSha256PlanDigestPort

Kind: `function`
Module: `src/features/plan/adapters/outbound/createSha256PlanDigestPort.ts`
Source: `src/features/plan/adapters/outbound/createSha256PlanDigestPort.ts:6:1`

Create the Node SHA-256 digest adapter used for semantic input fingerprints and plan IDs.

### Signatures

- `() => ApmPlanDigestPort`
  - returns: `ApmPlanDigestPort`

## inspectDependencyInventoryAsync

Kind: `function`
Module: `src/features/status/adapters/outbound/inspectDependencyInventoryAsync.ts`
Source: `src/features/status/adapters/outbound/inspectDependencyInventoryAsync.ts:23:1`

Inspect package declarations, lock instances, and installed state without running package code.

### Signatures

- `(input: { readonly inspection: ProjectInspection; }) => Promise<ApmDependencyInventory>`
  - input: `{ readonly inspection: ProjectInspection; }`
  - returns: `Promise<ApmDependencyInventory>`

## planAsync

Kind: `function`
Module: `src/features/plan/application/planAsync.ts`
Source: `src/features/plan/application/planAsync.ts:23:1`

Build one serializable reproducible update plan without mutating the inspected project.

### Signatures

- `(input: ApmPlanInput, ports: ApmPlanPorts) => Promise<ApmPlanResult>`
  - input: `ApmPlanInput`
  - ports: `ApmPlanPorts`
  - returns: `Promise<ApmPlanResult>`

## planProjectAsync

Kind: `function`
Module: `src/features/plan/composition/planProjectAsync.ts`
Source: `src/features/plan/composition/planProjectAsync.ts:16:1`

Compose project status and native Node planning adapters behind the shared headless plan use case.

### Signatures

- `(input: ApmPlanProjectInput, options?: ApmPlanProjectOptions) => Promise<ApmPlanResult>`
  - input: `ApmPlanProjectInput`
  - options: `ApmPlanProjectOptions` (optional)
  - returns: `Promise<ApmPlanResult>`

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

## validateSavedPlanAsync

Kind: `function`
Module: `src/features/plan/domain/validateSavedPlanAsync.ts`
Source: `src/features/plan/domain/validateSavedPlanAsync.ts:11:1`

Revalidate a saved plan against current project evidence and executor identity before mutation.

### Signatures

- `(plan: ApmPlanResult, status: ApmStatusResult, executor: ApmPlanExecutorIdentity, digest: ApmPlanDigestPort) => Promise<readonly ApmPlanBlocker[]>`
  - digest: `ApmPlanDigestPort`
  - executor: `ApmPlanExecutorIdentity`
  - plan: `ApmPlanResult`
  - status: `ApmStatusResult`
  - returns: `Promise<readonly ApmPlanBlocker[]>`

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

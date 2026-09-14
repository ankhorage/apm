# Public API

## APM_BOOTSTRAP_SUPPORT

Kind: `value`
Module: `src/constants/support.ts`
Source: `src/constants/support.ts:22:14`

Describe exactly what the bootstrap release proves without claiming update support prematurely.

Runtime: APM itself requires Node 24 or newer. Repository development uses Bun 1.4.2, but APM
does not require inspected customer projects to use Bun.

Package managers: npm, pnpm, Yarn, and Bun are read-only inspection targets in the bootstrap.
Their mutation semantics, supported versions, lock formats, and linker modes are deliberately
unqualified until the inventory/planning work proves them.

Platforms: Linux is exercised by bootstrap CI. macOS and Windows update execution remain
unqualified. Read-only Project Detector behavior is delegated to its published support contract.

Operations: `status` is the first real use case. `plan`, `apply`, and `verify` reserve their
command paths but return an explicit unavailable result until their owning roadmap work lands.

Dependency direction is inward: headless status depends on an injected inspection port; Node
composition binds that port to `@ankhorage/project-detector/node`; standalone CLI and Ankh are
inbound adapters over the same Node composition. The root package has no Node import side effect.

## ApmStatusDiagnostic

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:11:1`

### Members

| Name    | Kind     | Type     | Required | Description |
| ------- | -------- | -------- | -------- | ----------- |
| code    | property | `string` | yes      |             |
| message | property | `string` | yes      |             |
| path    | property | `string` | no       |             |

## ApmStatusInput

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:3:1`

### Members

| Name     | Kind     | Type     | Required | Description |
| -------- | -------- | -------- | -------- | ----------- |
| rootPath | property | `string` | yes      |             |

## ApmStatusInspectionPort

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:7:1`

### Members

| Name                | Kind     | Type                                               | Required | Description |
| ------------------- | -------- | -------------------------------------------------- | -------- | ----------- |
| inspectProjectAsync | property | `(rootPath: string) => Promise<ProjectInspection>` | yes      |             |

## ApmStatusLanguage

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:17:1`

### Members

| Name        | Kind     | Type                | Required | Description |
| ----------- | -------- | ------------------- | -------- | ----------- |
| id          | property | `string`            | yes      |             |
| score       | property | `number`            | yes      |             |
| sourceRoots | property | `readonly string[]` | yes      |             |

## ApmStatusProjectSummary

Kind: `type`
Module: `src/types/status.ts`
Source: `src/types/status.ts:23:1`

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
Source: `src/types/status.ts:32:1`

### Members

| Name          | Kind     | Type                             | Required | Description |
| ------------- | -------- | -------------------------------- | -------- | ----------- |
| complete      | property | `boolean`                        | yes      |             |
| diagnostics   | property | `readonly ApmStatusDiagnostic[]` | yes      |             |
| operation     | property | `"status"`                       | yes      |             |
| project       | property | `ApmStatusProjectSummary`        | yes      |             |
| rootPath      | property | `string`                         | yes      |             |
| schemaVersion | property | `1`                              | yes      |             |

## createCliProvider

Kind: `function`
Module: `src/cli/createCliProvider.ts`
Source: `src/cli/createCliProvider.ts:10:1`

Create the thin Ankh command provider over the same standalone APM command adapter.

### Signatures

- `(version: string) => AnkhRuntimeCommandProvider`
  - version: `string`
  - returns: `AnkhRuntimeCommandProvider`

## statusAsync

Kind: `function`
Module: `src/features/status/application/statusAsync.ts`
Source: `src/features/status/application/statusAsync.ts:15:1`

Build serializable APM status from read-only project evidence supplied by an outbound port.

Hosts can call this use case without a terminal, filesystem access, or Node composition and can
provide a deterministic fake port in tests. Status never installs dependencies or executes
project lifecycle scripts.

### Signatures

- `(input: ApmStatusInput, inspectionPort: ApmStatusInspectionPort) => Promise<ApmStatusResult>`
  - input: `ApmStatusInput`
  - inspectionPort: `ApmStatusInspectionPort`
  - returns: `Promise<ApmStatusResult>`

## statusProjectAsync

Kind: `function`
Module: `src/features/status/composition/statusProjectAsync.ts`
Source: `src/features/status/composition/statusProjectAsync.ts:7:1`

Compose the headless status use case with Project Detector's published Node inspection edge.

### Signatures

- `(input: ApmStatusInput) => Promise<ApmStatusResult>`
  - input: `ApmStatusInput`
  - returns: `Promise<ApmStatusResult>`

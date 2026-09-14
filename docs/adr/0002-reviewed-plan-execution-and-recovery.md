# ADR 0002: Reviewed plan execution, recovery and verification

Status: Accepted for APM #6 implementation.

## Context

APM `status` and `plan` are deliberately read-only. Released plan schema v1 freezes target versions,
reviewed file changes, artifact identities and an ordered step graph, but it does not yet carry enough
typed execution data for `apply` to execute package-owned migration/projection handlers without
reconstructing intent from free-form evidence. Recovery also requires durable knowledge of which
side effect was intended, started, observed and committed.

APM #6 therefore owns the execution boundary. The executor must preserve unrelated project files,
work without Git, reject stale plans and concurrent writers, resume interrupted work without blindly
repeating effects, and distinguish reversible local mutations from external/manual effects.

## Decision

### Plan schema v2 is executable

APM uses one current plan schema. Schema v2 replaces the v1 step shape inside this package; no v1
runtime compatibility path is retained.

Every executable step carries a serializable execution descriptor in addition to its stable ID,
prerequisites, reason and evidence:

- dependency-file steps reference the exact reviewed file changes;
- install steps identify the install root, package manager/linker and frozen dependency graph;
- migration steps identify the owner, migration ID, exact extension artifact/descriptor binding and
  reviewed migration plan including mutation IDs;
- projection steps identify the owner, projection ID, exact extension artifact/descriptor binding
  and reviewed projection plan;
- validation steps contain required structured validation checks;
- shipment/follow-up steps remain explicit non-incidental work and are not silently executed.

`apply` never resolves `latest`, rebuilds a migration path, invents a generator mutation or upgrades a
running host. If required executable evidence is absent, planning is incomplete and apply is blocked.

### Project-local durable execution state

Apply state lives below `.apm/operations/` in the project being updated. It does not require a Git
repository and is excluded from the reviewed application file set.

Each operation owns:

- an immutable copy/digest of the reviewed plan;
- `journal.json` with schema version, operation/plan IDs, executor identity, timestamps and ordered
  step records;
- recoverable pre-step snapshots for files APM may mutate;
- bounded/redacted adapter logs and failure/recovery evidence.

Journal writes are atomic: write a sibling temporary file, fsync/close as supported by the adapter,
then rename over the journal. The application use case depends only on a journal port.

### Exclusive writer lock

`.apm/operation.lock` coordinates APM/Studio writers for one project scope.

The lock records operation ID, plan ID, process ID, hostname and acquisition timestamp. Acquisition
uses exclusive create semantics.

A lock is not silently stolen. A same-host lock is stale only when its recorded process no longer
exists. A resume operation may replace that stale lock only when the durable journal identifies the
same resumable operation. A live process, a mismatched operation, or an unprovable cross-host lock is
a conflict requiring explicit recovery rather than timeout-based guessing.

### Step journal state machine

Each step progresses monotonically:

`pending -> intended -> effect-started -> effect-observed -> committed`

Terminal exceptional states are `failed`, `cancelled`, and `recovery-required`.

Before a side effect, APM persists `intended`; immediately before invoking the side-effect adapter it
persists `effect-started`. After the adapter returns, APM verifies the exact expected postcondition
and persists `effect-observed`; only then does it persist `committed`.

A crash after `effect-started` but before `committed` is not assumed to mean either success or
failure. Resume first evaluates the step postcondition:

- if the expected result is already present, the step advances to `effect-observed/committed` without
  repeating the effect;
- if the expected result is absent and the step is declared restartable/idempotent, it may be run
  again;
- otherwise the operation becomes `recovery-required` with concrete manual instructions.

APM does not claim exactly-once execution for package managers, owner code or external systems.

### Preconditions and snapshots

Before the first project mutation, apply revalidates the saved plan fingerprint and executor identity
against fresh status. Before each local step, the adapter rechecks the reviewed before-digests for the
files that step owns. Concurrent external edits therefore block the step rather than being
silently overwritten.

APM snapshots only files it is about to change. Rollback restores only snapshots whose corresponding
step is explicitly reversible and whose current state still matches the failed operation's observed
output. APM never performs blanket Git reset/checkout and never discards unrelated/uncommitted files.

### Permissions are structured inputs

Core apply/verify use cases never prompt a terminal. Execution permission is explicit input data.
Lifecycle scripts, executable owner code and external effects are separate capabilities. An adapter
may ask a human for consent, but it passes the resulting permissions into the use case.

Package-manager lifecycle scripts are disabled unless the reviewed plan contains an explicit script
effect and the caller grants that capability. Store submission, production database migration and
production infrastructure mutation are follow-up work, not incidental apply behavior.

### Verification is independent

`verify` is a separate headless use case. It reads the completed operation/plan plus fresh project
evidence and verifies:

1. declared/locked/installed package-manager consistency;
2. migration handler postconditions;
3. fresh projection state/materialization postconditions;
4. required application validation/build checks;
5. remaining target-specific shipment work.

Missing, skipped or failed required validation cannot produce verified success. Verification output is
serializable and suitable for CLI, Ankh and Studio adapters.

### CLI/API semantics

Standalone CLI and Ankh call the same use cases.

- `apm apply --plan <file>` starts a new operation from a reviewed serialized plan.
- `apm apply --resume <operation-id>` resumes one durable operation; it never creates a new plan.
- `apm verify --operation <operation-id>` verifies the applied operation.
- `--json` changes rendering only.

Human-friendly output and consent prompts belong to inbound adapters. Exit codes distinguish success,
incomplete/recovery-required state, invalid input/stale plans and execution failure.

## Consequences

- Apply/recovery/verify can be tested with in-memory ports before Node filesystem/process adapters.
- Plan schema v2 is a deliberate current-only public schema change before the executor is consumed by
  Studio.
- Recovery is evidence-driven and conservative: ambiguous effects stop for manual recovery instead of
  being repeated or rolled back optimistically.
- `.apm/operations` is APM-owned operational state, not application configuration and not a Contracts
  concern.
- Studio can expose progress and recovery by consuming structured journal/result events without
  receiving filesystem/process credentials in browser code.

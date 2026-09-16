# @ankhorage/apm

## 0.8.5

### Patch Changes

- 4e5ddfa: Treat Bun lock entries excluded by current OS or CPU constraints as validly absent install evidence.

## 0.8.4

### Patch Changes

- 5a3a09a: Exclude the Yarn install-root workspace importer from materialized dependency package evidence while retaining it for direct dependency resolution.

## 0.8.3

### Patch Changes

- cfd2edf: Resolve reviewed direct dependency targets exactly in disposable native staging while preserving the reviewed manifest range.

## 0.8.2

### Patch Changes

- 23502ea: Fix automatic safe dependency updates when status package IDs are qualified by their install root.

## 0.8.1

### Patch Changes

- c2d1e3e: Re-read and revalidate the durable operation journal after acquiring the recovery lock. Preserve completion and step progress committed by another caller, reject missing or replaced operation state before effects, and always release the acquired lock if the authoritative read fails.

## 0.8.0

### Minor Changes

- a298a28: Inspect nested hoisted Bun package instances and dependency edges by their lockfile placement. Deduplicate registry lookups, bound their concurrency and support realistic dependency graphs while preserving explicit budget and unknown-evidence semantics.

## 0.7.0

### Minor Changes

- 522993d: Expose the canonical Node project-writer lock adapter so trusted hosts can serialize their mutations with APM apply operations.

## 0.6.0

### Minor Changes

- efa561b: Expose owner-aware Node update composition and exact npm extension artifact identity resolution for package-owned update integrations.

## 0.5.0

### Minor Changes

- cf29562: Add durable apply, interruption recovery, and verification for reviewed update plans, including executable plan schema v2 steps, project writer locking, journaled resume semantics, scoped rollback snapshots, native package-manager execution, and real `apm apply` / `apm verify` commands.

## 0.4.0

### Minor Changes

- 8f1bd4d: Add deterministic, reviewable update planning with native package-manager staging, exact saved-plan evidence, bounded package-owned fixed-point resolution, migration/projection ordering, and the real `apm plan` command.

## 0.3.0

### Minor Changes

- aa5f54b: Add the package-owned update protocol, including public migration/projection types, descriptor validation, deterministic migration-path resolution, and trusted extension execution boundaries.

## 0.2.0

### Minor Changes

- 42cea12: Expand `status` into evidence-based dependency, lockfile, installation, registry availability, host, projection, and migration reporting with explicit incomplete states across supported npm, pnpm, Yarn, and Bun inspection modes.

## 0.1.0

### Minor Changes

- 0997170: Initialize the standalone APM package with a headless status boundary, Node composition, CLI and Ankh provider, explicit bootstrap support limits, and canonical Ankhorage repository tooling.

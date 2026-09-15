# @ankhorage/apm

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

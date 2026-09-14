# ADR 0001: Package-owned update protocol

Status: Proposed

Issue: https://github.com/ankhorage/apm/issues/4  
Roadmap: https://github.com/ankhorage/apm/issues/1  
Owner audit: https://github.com/ankhorage/studio/issues/500  
Release validation: https://github.com/ankhorage/devtools/issues/208

## Context

APM must plan and execute application updates without embedding Studio, framework or package-specific generation policy. Individual packages own their compatibility rules, migrations, projections and release effects. APM owns protocol validation, graph planning, execution ordering, recovery and verification.

The protocol must support older installed hosts discovering newer package releases, skipped package versions, duplicate migration IDs, changed migration implementations, target-version generators, project files with mixed generated/user ownership and updates that have native, web, OTA or backend shipment implications.

Status and plan are read-only operations. Metadata obtained from registry artifacts is data. Executable package extensions are trusted code and are never treated as a security sandbox merely because they run in a subprocess.

## Decision

### 1. Discovery lives in package metadata

An opt-in package advertises APM ownership under its existing `package.json` `ankhorage` namespace:

```json
{
  "ankhorage": {
    "apm": {
      "protocolVersion": 1,
      "descriptor": "./apm/update.json",
      "extension": "./apm"
    }
  }
}
```

`descriptor` is a package-relative static JSON file included in the published artifact. `extension` is an optional public package export subpath. Packages that only provide compatibility/effect metadata need no executable extension.

APM can discover the protocol version and descriptor location from registry/package metadata without importing package code. Unknown protocol versions are blockers before any extension execution.

### 2. Static descriptor and executable extension are separate contracts

The static descriptor is versioned, serializable and safe to inspect without executing package code. It declares:

- exact owner package name and version;
- supported source history and explicitly unsupported/manual history;
- compatibility constraints;
- migrations and their immutable owner-scoped identities;
- migration prerequisites, phases, affected scopes, declared effects and recovery properties;
- projection identities and ownership claims;
- release/shipment effects;
- the public extension export when executable behavior is required.

The executable extension contains functions for the capabilities named by the descriptor. It is not registry metadata and is not imported merely to inspect whether an update exists.

The runtime extension identifies the exact protocol version and static descriptor digest it implements. Devtools validates this binding from the packed release artifact. APM freezes the descriptor digest and registry/package artifact integrity into a plan before mutation.

A package cannot self-declare its own npm tarball integrity without a circular hash. Artifact integrity therefore comes from package-manager/registry evidence (`dist.integrity` or equivalent) and the resolved lock/install state, while descriptor/code binding is validated inside the artifact.

### 3. Trust and execution rules are explicit

Static metadata inspection never grants permission to execute an extension.

An executable extension may run only when the caller/host has explicitly trusted the exact owner package artifact identity. APM records that identity in the plan/journal. The protocol distinguishes read-only capabilities (`inspect`, `plan`, `verify`) from mutating capabilities (`migrate`, `materialize`).

Status and plan never run lifecycle scripts or migration/materialization functions. They may invoke an explicitly trusted extension's declared read-only capabilities when a concrete projection/state inspection requires executable owner logic. This is a trust decision, not a sandbox guarantee.

Downloaded target code is never silently executed because metadata was fetched. If target-version read-only planning requires target code, that exact staged artifact must be explicitly trusted first.

### 4. Source, target and intermediate owner code are immutable execution inputs

Before apply mutates the package graph, APM stages every executable owner artifact referenced by the reviewed plan in an immutable operation workspace outside the project.

Each executable migration/projection step declares which artifact role supplies its code:

- `source`: the exact source owner artifact;
- `target`: the exact selected target owner artifact;
- `intermediate`: an exact historical package version named by the descriptor and resolved/frozen by the plan.

APM executes staged code in a fresh process from the staged artifact path. It never relies on Node module cache state from a running Studio/APM host and never imports a module after its package path has been replaced underneath the process.

Intermediate artifacts are exceptional but supported for historical migrations that were not carried forward. Their exact versions and registry integrity become immutable plan inputs. Missing or unavailable intermediate artifacts block the path.

### 5. Migration history is a directed graph, not a list of release scripts

Migration identities are stable within an owner package and combine the owner package name with a local migration ID. Reusing an ID with a different checksum is invalid history.

Each migration declares:

- `id` and immutable `checksum`;
- source version range and optional source state revision;
- target version range and optional target state revision;
- execution phase (`pre-install` or `post-install`);
- implementation artifact role;
- prerequisite migration identities;
- affected project scopes;
- side-effect classification;
- verification requirements;
- idempotency/restart/recovery properties;
- reversibility only when the owner can actually prove a reverse operation.

The selected source-to-target update must resolve to one complete acyclic migration path. Skipping releases is supported only when the target descriptor contains or references every required transition. Missing history, ambiguous paths, prerequisite cycles, unavailable intermediate artifacts, unsupported downgrades and explicitly unsupported source history are blockers.

A release that requires no migration declares that fact through supported history; no empty script is required.

### 6. Projection ownership is explicit and conflict-detectable

Projection descriptors identify stable owner-scoped projection IDs and static ownership claims. Claims describe the narrowest practical owned unit: whole file, structured field/pointer or declared dynamic scope.

Executable projection capabilities are:

- `inspect`: read current state/fingerprints;
- `plan`: return intended changes and ownership-sensitive preconditions;
- `materialize`: perform the reviewed projection writes during apply;
- `verify`: confirm the resulting projection.

Projection evidence fingerprints both relevant input state and generator/owner artifact identity. A generator version change can therefore make a projection stale even when source manifest data did not change.

Overlapping whole-file/field claims from different owners, writes outside declared claims, or a generated write that would replace user-owned content without an explicit ownership handoff are blockers. APM never resolves an ownership conflict by last-writer-wins.

### 7. Plan validity freezes protocol evidence

A reviewed plan records at least:

- protocol/schema version;
- owner package source and target versions;
- source/target/intermediate artifact identities and integrity;
- static descriptor digest(s);
- migration IDs/checksums and prerequisite graph;
- projection IDs, claims and relevant input/generator fingerprints;
- extension trust identity;
- declared release effects.

Apply revalidates these inputs before mutation. A changed descriptor checksum, migration checksum, artifact integrity, source package state or projection input fingerprint makes the plan stale instead of silently adapting it.

### 8. Recovery promises are capability-specific

`idempotent`, `restartable` and `reversible` are different properties and are declared independently.

- Idempotent: repeating the same completed operation is safe.
- Restartable: an interrupted operation can resume/retry from its documented precondition.
- Reversible: the owner provides a verified reverse operation for local effects.

APM journals step state and verification evidence. It never promises transactional rollback across package-manager processes, external services, deployment systems or other effects the owner did not declare reversible.

### 9. Release effects are findings, not implicit shipment actions

The descriptor can declare separate effects for:

- web rebuild;
- web redeploy;
- native binary/store distribution;
- OTA eligibility;
- backend/infrastructure prerequisite;
- manual/unknown review.

OTA is safe only when explicit platform evidence proves eligibility. Missing metadata remains `unknown`; it is never interpreted as "no migration needed", "no rebuild needed" or "OTA safe".

APM reports these effects. Apply does not submit stores, deploy production infrastructure or silently invoke Deploy/Infra lifecycle owners.

### 10. Dependency direction remains acyclic

APM defines and validates the protocol. Owner packages implement the protocol without importing Studio. Studio may publish a headless owner extension that depends on APM types/protocol, but APM has no Studio dependency.

Devtools consumes APM's public validator during release validation; it does not copy the schema. The release graph is producer-first: APM protocol, owner package metadata/extensions, APM executor when required, then Studio host/UI consumers.

Public protocol declarations are owned by APM `src/types` and exported through `@ankhorage/apm/types`. No new Contracts dependency is introduced.

## Validation and blockers

Canonical descriptor validation rejects at least:

- unsupported protocol/schema versions;
- owner name/version mismatch;
- malformed or duplicate owner-scoped migration/projection IDs;
- duplicate IDs with changed checksums across supported history;
- missing prerequisites and prerequisite cycles;
- unsupported or incomplete source history;
- ambiguous/incomplete skipped-version migration paths;
- invalid source/target/intermediate artifact roles;
- overlapping projection ownership claims;
- executable capability references without a public extension export;
- effect claims that assert OTA safety without evidence.

Validation returns structured blockers with stable codes, scope, evidence, reason and next action. CLI wording stays outside protocol/domain state.

## Consequences

- Status can discover newer owner metadata without executing newer package code.
- Target-version planning/execution is possible without importing Studio into APM.
- Historical migrations remain reproducible because artifact identity, descriptor digest and migration checksum are frozen.
- The protocol can represent legitimate no-op releases without fake migration scripts.
- Package authors carry the burden of declaring supported history and ownership precisely; unsupported history remains an explicit blocker.
- Executable extensions remain a trust boundary. Subprocesses improve process isolation/restart behavior but are not a security sandbox.

## Deferred to later roadmap issues

Issue #4 defines protocol contracts, validators and behavior fixtures. Issue #5 owns complete application update-plan resolution. Issue #6 owns journaling, staging, package-manager mutation, subprocess execution and recovery implementation. Studio #500 owns its action/projection audit and first real owner extension. Devtools #208 owns packed-artifact release gating and producer rollout.

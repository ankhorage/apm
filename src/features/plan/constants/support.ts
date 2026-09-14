/***
 * Publish the deterministic planning guarantees and native resolver matrix implemented by APM.
 *
 * `plan` is read-only with respect to the inspected project. Package-manager resolution runs in a
 * disposable staging directory and uses the selected project's native npm, pnpm, Yarn, or Bun
 * resolver. Lifecycle scripts are disabled. Only reviewed manifest and lockfile changes are returned
 * as serializable plan evidence; staging/cache/network effects remain outside the project tree.
 *
 * The default dependency policy is conservative: only direct registry packages with a newer version
 * satisfying their existing declared range are selected automatically. Latest majors, prereleases,
 * downgrades and exact versions require explicit selections and APM never invents a new caret range.
 * Explicit transitive selections remain lock-only; they are not promoted into root dependencies.
 *
 * Native solver output is re-inspected through the same package-manager evidence adapters used by
 * `status`. Duplicate package instances, peer contexts and workspace links keep their native identity.
 * Unknown artifact sources, peer conflicts, unsupported lock/linker modes and unresolved targets are
 * blockers rather than partial executable plans.
 *
 * Package-owned migration/projection planners can request additional dependency selections. APM
 * resolves those through a bounded fixed-point loop (four iterations by default). Conflicting owner
 * requirements or non-convergence block the plan, and intermediate diffs are never exposed as an
 * executable result. Required host/extension upgrades are explicit restart-and-re-plan boundaries.
 *
 * Saved plans contain exact targets, reviewed file content/digests, resolved graph/artifact identities,
 * ordered step prerequisites, executor identity and a semantic input fingerprint. Registry freshness
 * timestamps are recorded separately from fingerprint validity: refreshing identical registry evidence
 * does not invalidate an otherwise identical plan. Apply must revalidate the project fingerprint and
 * executor instead of re-resolving `latest`.
 *
 * Shipment effects remain separate from source updates. In particular, dependency graph changes are
 * never assumed OTA-safe; without package/platform evidence APM records OTA eligibility as `unknown`.
 * @readme
 */
export const APM_PLAN_SUPPORT = {
  schemaVersion: 1,
  defaultPolicy: {
    dependencyUpdates: 'safe',
    repairInstallations: true,
    repairProjections: true,
    maxGeneratorIterations: 4,
  },
  nativeResolution: {
    npm: { mode: 'package-lock-only', lifecycleScripts: false },
    pnpm: { mode: 'lockfile-only', lifecycleScripts: false },
    yarn: { mode: 'update-lockfile', lifecycleScripts: false },
    bun: { mode: 'lockfile-only', lifecycleScripts: false },
  },
  staging: { projectWrites: false, disposable: true },
  savedPlans: {
    exactTargets: true,
    exactArtifacts: true,
    executorBound: true,
    freshnessSeparateFromFingerprint: true,
  },
  shipment: { dependencyChangeOtaDefault: 'unknown' },
} as const;

/***
 * Publish the exact read-only status matrix proven by the evidence adapters.
 *
 * Runtime: APM requires Node 24 or newer. Development uses Bun 1.4.2, but inspected customer
 * projects may use any explicitly supported manager below.
 *
 * npm: package-lock v2 and v3 are parsed. The physical node_modules locations recorded by npm are
 * checked without executing package code. package-lock v1 is detected but remains inspection-only.
 *
 * pnpm: lockfile v9 is parsed, including importer roots, package/snapshot instance identities,
 * workspace links and peer-context suffixes. Installed state is confirmed from the pnpm virtual
 * store lock when present; unknown/custom layouts stay explicit.
 *
 * Yarn: Berry lock metadata v8 is parsed. `nodeLinker: node-modules` uses `.yarn-state.yml`;
 * `nodeLinker: pnp` reads `.pnp.data.json` when present and never executes `.pnp.cjs`. An inlined
 * PnP map therefore remains incomplete by design. Yarn Classic and Yarn's pnpm linker are detected
 * but are not claimed as complete inventory modes in this release.
 *
 * Bun: text `bun.lock` v2 is parsed. Bun's isolated `.bun` store and ordinary node_modules links are
 * inspected as data. Binary `bun.lockb` and unknown lock versions are inspection-only.
 *
 * Registry availability uses npm-compatible registries selected from project/user npmrc and
 * environment overrides. Credentials are used only at the HTTP edge and are never returned in
 * reports. Offline cache misses and registry/auth/network failures make availability unknown.
 *
 * `status` is read-only. `plan`, `apply`, and `verify` remain separate roadmap operations.
 * @readme
 */
export const APM_STATUS_SUPPORT = {
  runtime: { node: '>=24', developmentPackageManager: 'bun@1.4.2' },
  packageManagers: {
    npm: { lockfileVersions: [2, 3], linker: 'node-modules' },
    pnpm: { lockfileVersions: ['9.0'], linker: 'virtual-store' },
    yarn: { lockfileVersions: [8], linkers: ['pnp', 'node-modules'] },
    bun: { lockfileVersions: [2], linkers: ['isolated', 'hoisted'] },
  },
  registry: { protocol: 'npm-compatible', offlineCache: true },
  operations: { status: 'implemented', plan: 'unavailable', apply: 'unavailable', verify: 'unavailable' },
} as const;

export const STATUS_LOCKFILES = [
  { manager: 'npm', fileName: 'package-lock.json' },
  { manager: 'pnpm', fileName: 'pnpm-lock.yaml' },
  { manager: 'yarn', fileName: 'yarn.lock' },
  { manager: 'bun', fileName: 'bun.lock' },
  { manager: 'bun', fileName: 'bun.lockb' },
] as const;

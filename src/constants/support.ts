/***
 * Describe exactly what the bootstrap release proves without claiming update support prematurely.
 *
 * Runtime: APM itself requires Node 24 or newer. Repository development uses Bun 1.4.2, but APM
 * does not require inspected customer projects to use Bun.
 *
 * Package managers: npm, pnpm, Yarn, and Bun are read-only inspection targets in the bootstrap.
 * Their mutation semantics, supported versions, lock formats, and linker modes are deliberately
 * unqualified until the inventory/planning work proves them.
 *
 * Platforms: Linux is exercised by bootstrap CI. macOS and Windows update execution remain
 * unqualified. Read-only Project Detector behavior is delegated to its published support contract.
 *
 * Operations: `status` is the first real use case. `plan`, `apply`, and `verify` reserve their
 * command paths but return an explicit unavailable result until their owning roadmap work lands.
 *
 * Dependency direction is inward: headless status depends on an injected inspection port; Node
 * composition binds that port to `@ankhorage/project-detector/node`; standalone CLI and Ankh are
 * inbound adapters over the same Node composition. The root package has no Node import side effect.
 * @readme
 */
export const APM_BOOTSTRAP_SUPPORT = {
  runtime: {
    node: '>=24',
    developmentPackageManager: 'bun@1.4.2',
  },
  packageManagers: {
    npm: 'inspection-only',
    pnpm: 'inspection-only',
    yarn: 'inspection-only',
    bun: 'inspection-only',
  },
  platforms: {
    linux: 'bootstrap-ci',
    darwin: 'not-yet-qualified',
    win32: 'not-yet-qualified',
  },
  operations: {
    status: 'implemented',
    plan: 'unavailable',
    apply: 'unavailable',
    verify: 'unavailable',
  },
} as const;

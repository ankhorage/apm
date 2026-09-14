import { defineParadoxConfig } from '@ankhorage/paradox';

export default defineParadoxConfig({
  mode: 'write',
  docs: {
    title: '@ankhorage/apm',
    description: 'Headless project update analysis, planning, execution, recovery, and verification.',
  },
  package: {
    root: '.',
    entrypoints: ['src/apm.ts', 'src/nodeApm.ts', 'src/cli/createCliProvider.ts'],
  },
  output: { dir: './paradox' },
});

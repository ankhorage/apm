import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig({
  entry: [
    'src/apm.ts',
    'src/nodeApm.ts',
    'src/types/public.ts',
    'src/cli/createCliProvider.ts',
    'src/cli/provider.ts',
    'src/cli/runAsync.ts',
    'examples/**/*.ts',
    'paradox.config.ts',
    'eslint.config.mjs',
    'eslint.examples.config.mjs',
    'eslint.local.config.mjs',
    '.prettierrc.js',
    'prettier.local.config.js',
  ],
});

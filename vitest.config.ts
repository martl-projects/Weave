import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    testTimeout: 30000,
    // Daemons in tests serve post links on a port of their own, not the real 7710.
    env: { WEAVE_LINK_PORT: '0' },
  },
});

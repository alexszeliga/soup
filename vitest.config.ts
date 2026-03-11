import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@soup/core': path.resolve(__dirname, './packages/core/src'),
      '@soup/database/schema.js': path.resolve(__dirname, './packages/database/src/schema.ts'),
      '@soup/database': path.resolve(__dirname, './packages/database/src/client.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [path.resolve(__dirname, './apps/web/src/test/setup.ts')],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    pool: 'forks',
    forks: {
      singleFork: true,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.d.ts',
        'packages/database/src/schema.ts',
      ],
    },
  },
});

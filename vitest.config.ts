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
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});

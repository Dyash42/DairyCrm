import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/main.ts',
        'src/whatsapp/index.ts',
        'src/whatsapp/repos.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@jharanai/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
});

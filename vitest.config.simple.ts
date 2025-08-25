/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./server/tests/setup-simple.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'server/tests/',
        '*.config.ts',
        'client/',
        'shared/schema.ts'
      ]
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    include: [
      'server/tests/**/*.test.ts'
    ],
    exclude: [
      'node_modules/**',
      'dist/**'
    ],
    reporters: ['verbose'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@server': path.resolve(__dirname, './server'),
      '@shared': path.resolve(__dirname, './shared'),
      '@tests': path.resolve(__dirname, './server/tests')
    }
  }
});
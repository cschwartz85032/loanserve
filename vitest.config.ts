/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./server/tests/setup.ts'],
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
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
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
    reporters: ['verbose', 'json'],
    outputFile: {
      json: './test-results.json'
    }
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
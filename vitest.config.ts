import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@web': path.resolve(__dirname, './web/src'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./test/setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/.worktrees/**', 'web/e2e/**'],
  },
})

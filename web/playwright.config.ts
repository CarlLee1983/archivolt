import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5174',
  },
  webServer: {
    command: 'VITE_PORT=5174 bunx vite --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    timeout: 30000,
  },
})

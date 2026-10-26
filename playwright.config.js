import { defineConfig } from '@playwright/test';

// These tests call the real Claude API, so each run costs money.
// Start `npm run dev` first (see CLAUDE.md), then run one test file at a time.
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 1000 },
  },
});

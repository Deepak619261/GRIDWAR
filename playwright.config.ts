import { defineConfig } from '@playwright/test';

const BASE_URL = process.env['BASE_URL'] ?? 'https://browser-83a2l41u6-deepaks-projects-70214c28.vercel.app';

// Set VERCEL_BYPASS_SECRET to the value from:
// Vercel Dashboard → Project → Settings → Security → Protection Bypass for Automation
const bypassSecret = process.env['VERCEL_BYPASS_SECRET'];

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    headless: true,
    navigationTimeout: 15_000,
    extraHTTPHeaders: bypassSecret
      ? { 'x-vercel-protection-bypass': bypassSecret }
      : {},
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});

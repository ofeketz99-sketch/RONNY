'use strict';
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.cjs',
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  expect: { timeout: 20000 },
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});

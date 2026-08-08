const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  use: { baseURL: 'http://127.0.0.1:3010', trace: 'retain-on-failure' },
  webServer: {
    command: 'node tests/e2e-server.js',
    url: 'http://127.0.0.1:3010/health',
    reuseExistingServer: true,
  },
});

import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e', fullyParallel: false, workers: 1, timeout: 45000,
  expect: { timeout: 15000 }, reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3179', trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: { args: ['--enable-unsafe-swiftshader'] } },
  projects: process.env.CI ? [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }] : [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'mobile-emulation', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ]
});

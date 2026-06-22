import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  timeout: 120000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  use: {
    baseURL: process.env.PW_BASE_URL || 'http://localhost:5000',
    headless: true,
    viewport: { width: 1200, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'visual',
      testDir: './tests/visual',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'academic-api',
      testDir: './tests/academic',
      testMatch: '**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

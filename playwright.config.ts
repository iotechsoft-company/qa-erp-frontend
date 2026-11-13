import { defineConfig, devices } from '@playwright/test'

import { env } from './src/config/env'

export const STORAGE_STATE = '.auth/user.json'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: env.CI,
  retries: env.CI ? 2 : 0,
  workers: env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: env.CI
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [['list'], ['html', { open: 'on-failure' }]],
  use: {
    baseURL: env.BASE_URL,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    // The repo is PUBLIC: CI artifacts can be downloaded by anyone. A trace contains cookies/tokens and
    // typed values (passwords), so CI never records traces. Locally, keep traces for debugging.
    trace: env.CI ? 'off' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    // 1) login ครั้งเดียว แล้วเก็บ cookie ไว้ใน .auth/user.json
    { name: 'setup', testMatch: /setup\/.*\.setup\.ts/ },

    // 2) เทสที่ต้อง login แล้ว — reuse storageState
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
      testIgnore: [/setup\//, /auth\//],
    },

    // 3) เทสหน้า login / logout — เริ่มจาก session ว่าง
    {
      name: 'chromium-guest',
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
      testMatch: /auth\/.*\.spec\.ts/,
    },
  ],
})

import { expect, test as setup } from '@playwright/test'

import { requireCredentials } from '@config/env'
import { LoginPage } from '@pages/login.page'

import { STORAGE_STATE } from '../../playwright.config'

/**
 * Login ผ่าน UI ครั้งเดียว แล้วบันทึก cookie (access_token / refresh_token / csrf_token)
 * ลง .auth/user.json ให้ project อื่น reuse
 */
setup('authenticate', async ({ page }) => {
  const { username, password } = requireCredentials()
  const loginPage = new LoginPage(page)

  await loginPage.goto()
  await loginPage.login(username, password, { rememberMe: true })
  await loginPage.expectLoggedIn()

  const cookies = await page.context().cookies()
  expect(cookies.some((c) => c.name === 'access_token')).toBe(true)

  await page.context().storageState({ path: STORAGE_STATE })
})

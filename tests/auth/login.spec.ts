import { requireCredentials } from '@config/env'
import { expect, test } from '@fixtures/test'
import { LOGIN_TEXT } from '@pages/login.page'

test.describe('Login', { tag: ['@smoke', '@auth'] }, () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto()
  })

  test('แสดงฟอร์ม login ครบ', async ({ loginPage, page }) => {
    await expect(page.getByRole('heading', { name: LOGIN_TEXT.title })).toBeVisible()
    await expect(loginPage.username).toBeVisible()
    await expect(loginPage.password).toBeVisible()
    await expect(loginPage.submit).toBeEnabled()
  })

  test('login สำเร็จด้วย credential ที่ถูกต้อง', async ({ loginPage }) => {
    const { username, password } = requireCredentials()
    await loginPage.login(username, password)
    await loginPage.expectLoggedIn()
  })

  // ใช้ username ที่ไม่มีอยู่จริง — ห้ามใช้บัญชีจริงกรอกรหัสผิด เพราะ backend จะ lock บัญชี (userBlocked)
  test('แสดง error เมื่อ credential ไม่ถูกต้อง', async ({ loginPage, page }) => {
    await loginPage.login(`e2e-nonexistent-${Date.now()}`, 'wrong-password-e2e')
    await expect(loginPage.errorAlert).toContainText(LOGIN_TEXT.errors.invalidCredentials)
    await expect(page).toHaveURL(/\/login/)
  })

  test('toggle แสดง/ซ่อนรหัสผ่าน', async ({ loginPage, page }) => {
    await loginPage.password.fill('secret')
    await expect(loginPage.password).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'แสดงรหัสผ่าน' }).click()
    await expect(loginPage.password).toHaveAttribute('type', 'text')
  })
})

test.describe('Route guard', { tag: ['@smoke', '@auth'] }, () => {
  test('เข้า private route โดยไม่ login → redirect ไป /login', async ({ page }) => {
    await page.goto('/products')
    await expect(page).toHaveURL(/\/login/)
  })
})

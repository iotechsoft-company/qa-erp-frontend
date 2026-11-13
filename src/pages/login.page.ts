import { expect, type Locator, type Page } from '@playwright/test'

import { BasePage } from './base.page'

/** ข้อความอ้างอิงจาก erp-frontend: packages/core-auth/translation/th/auth.json */
export const LOGIN_TEXT = {
  title: 'เข้าสู่ระบบ',
  usernameLabel: 'ชื่อผู้ใช้งาน (Username)',
  passwordLabel: 'รหัสผ่าน (Password)',
  rememberMe: 'จดจำฉันไว้',
  submit: 'เข้าสู่ระบบ',
  errors: {
    invalidCredentials: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง',
    requiredFields: 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน',
  },
} as const

export class LoginPage extends BasePage {
  readonly path = '/login'

  readonly username: Locator
  readonly password: Locator
  readonly rememberMe: Locator
  readonly submit: Locator

  constructor(page: Page) {
    super(page)
    // TextField ของ ERP ตั้ง name="username" / name="password"
    this.username = page.locator('input[name="username"]')
    this.password = page.locator('input[name="password"]')
    this.rememberMe = page.getByRole('checkbox', { name: LOGIN_TEXT.rememberMe })
    this.submit = page.getByRole('button', { name: LOGIN_TEXT.submit, exact: true })
  }

  get errorAlert(): Locator {
    return this.alert
  }

  async login(username: string, password: string, opts: { rememberMe?: boolean } = {}) {
    await this.username.fill(username)
    await this.password.fill(password)
    if (opts.rememberMe) await this.rememberMe.check()
    await this.submit.click()
  }

  async expectLoggedIn() {
    await expect(this.page).not.toHaveURL(/\/login/)
  }
}

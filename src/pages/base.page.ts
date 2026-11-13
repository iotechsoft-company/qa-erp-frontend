import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Base Page Object — ทุกหน้าสืบทอดจากคลาสนี้
 *
 * Locator priority (ตาม Playwright best practice):
 *   1. getByRole(...)        — ใช้ accessible name (ภาษาไทยตาม next-intl locale = 'th')
 *   2. getByLabel / getByPlaceholder
 *   3. getByTestId(...)      — ถ้าขอให้ dev เพิ่ม data-testid ได้
 *   4. CSS / XPath           — หลีกเลี่ยง (MUI class เปลี่ยนบ่อย)
 */
export abstract class BasePage {
  /** path ของหน้า เช่น '/products' */
  abstract readonly path: string

  constructor(protected readonly page: Page) {}

  async goto() {
    await this.page.goto(this.path)
    await this.waitForReady()
  }

  /** override ในหน้าที่มีเงื่อนไข ready เฉพาะ (เช่นรอ table โหลด) */
  async waitForReady() {
    await expect(this.page).toHaveURL(new RegExp(`${escapeRegExp(this.path)}(\\?|$)`))
  }

  /**
   * MUI Snackbar / Alert
   * ตัด Next.js route announcer (`#__next-route-announcer__` มี role="alert" ว่าง ๆ อยู่ทุกหน้า) ออก
   */
  get alert(): Locator {
    return this.page.locator('[role="alert"]:not(#__next-route-announcer__)')
  }

  /** MUI CircularProgress / LinearProgress */
  get loading(): Locator {
    return this.page.getByRole('progressbar')
  }
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

import { expect, test } from '@fixtures/test'
import { PRIVATE_ROUTES } from '@data/routes'

/**
 * Smoke: ทุก private route ต้องเปิดได้หลัง login — ไม่เด้งไป /login, ไม่มี JS error, ไม่มี API 5xx
 * เป็นเทส read-only ปลอดภัยที่จะรันกับทุก env
 */
test.describe('Private routes load', { tag: '@smoke' }, () => {
  for (const route of PRIVATE_ROUTES) {
    test(`${route.name} (${route.path})`, async ({ page }) => {
      const pageErrors: string[] = []
      const serverErrors: string[] = []
      page.on('pageerror', (err) => pageErrors.push(err.message))
      page.on('response', (res) => {
        if (res.url().includes('/api/') && res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
      })

      await page.goto(route.path)
      await page.waitForLoadState('load')
      await expect(page.getByRole('progressbar')).toHaveCount(0)

      await expect(page).not.toHaveURL(/\/login/)
      expect(pageErrors, 'uncaught JS errors').toEqual([])
      expect(serverErrors, 'API 5xx responses').toEqual([])
    })
  }
})

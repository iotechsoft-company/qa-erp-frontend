import { test as base, expect } from '@playwright/test'

import { ApiClient } from '@api/api-client'
import { env, requireCredentials } from '@config/env'
import { DashboardPage, ItemGroupsPage, LoginPage, ProductGroupsPage, ProductsPage } from '@pages/index'

type Pages = {
  loginPage: LoginPage
  dashboardPage: DashboardPage
  itemGroupsPage: ItemGroupsPage
  productGroupsPage: ProductGroupsPage
  productsPage: ProductsPage
}

type Helpers = {
  /** API client ที่ login แล้ว — ใช้ seed/cleanup */
  api: ApiClient
  /** เรียกที่ต้นเทสที่สร้าง/แก้/ลบข้อมูล — skip อัตโนมัติถ้า ALLOW_MUTATION=false */
  allowMutation: void
}

export const test = base.extend<Pages & Helpers>({
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  dashboardPage: async ({ page }, use) => use(new DashboardPage(page)),
  itemGroupsPage: async ({ page }, use) => use(new ItemGroupsPage(page)),
  productGroupsPage: async ({ page }, use) => use(new ProductGroupsPage(page)),
  productsPage: async ({ page }, use) => use(new ProductsPage(page)),

  // ใช้ request context แยก (ไม่แชร์ cookie กับ browser) เพื่อเป็น pure Bearer client
  api: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({ baseURL: env.BASE_URL })
    const client = new ApiClient(ctx)
    const { username, password } = requireCredentials()
    await client.login(username, password)
    await use(client)
    await ctx.dispose()
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature requires object destructuring
  allowMutation: async ({}, use, testInfo) => {
    testInfo.skip(!env.ALLOW_MUTATION, 'ALLOW_MUTATION=false — skip test that writes data')
    await use()
  },
})

export { expect }

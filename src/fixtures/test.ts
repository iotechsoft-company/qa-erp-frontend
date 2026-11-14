import { test as base, expect } from '@playwright/test'

import { ApiClient } from '@api/api-client'
import { env, requireCredentials } from '@config/env'
import {
  PurchaseOrdersPage,
  GoodsReceiptsPage,
  PurchaseCreatePage,
  QuotationsPage,
  SalesOrdersPage,
  DeliveryNotesPage,
  SalesCreatePage,
  CustomersPage,
  DashboardPage,
  ItemGroupsPage,
  LoginPage,
  ProductGroupsPage,
  ProductsPage,
  PurchasersPage,
} from '@pages/index'

type Pages = {
  purchaseOrdersPage: PurchaseOrdersPage
  goodsReceiptsPage: GoodsReceiptsPage
  purchaseCreatePage: PurchaseCreatePage
  quotationsPage: QuotationsPage
  salesOrdersPage: SalesOrdersPage
  deliveryNotesPage: DeliveryNotesPage
  salesCreatePage: SalesCreatePage
  customersPage: CustomersPage
  purchasersPage: PurchasersPage
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
  purchaseOrdersPage: async ({ page }, use) => use(new PurchaseOrdersPage(page)),
  goodsReceiptsPage: async ({ page }, use) => use(new GoodsReceiptsPage(page)),
  purchaseCreatePage: async ({ page }, use) => use(new PurchaseCreatePage(page)),
  quotationsPage: async ({ page }, use) => use(new QuotationsPage(page)),
  salesOrdersPage: async ({ page }, use) => use(new SalesOrdersPage(page)),
  deliveryNotesPage: async ({ page }, use) => use(new DeliveryNotesPage(page)),
  salesCreatePage: async ({ page }, use) => use(new SalesCreatePage(page)),
  customersPage: async ({ page }, use) => use(new CustomersPage(page)),
  purchasersPage: async ({ page }, use) => use(new PurchasersPage(page)),
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

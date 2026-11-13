import { type Locator, type Page } from '@playwright/test'

import { BasePage } from './base.page'

/**
 * ตัวอย่าง list page — app/(private)/products/page.tsx (core-inventory)
 * TODO(codex): เติม locator ของ search / filter / create button / table row ให้ครบ
 */
export class ProductsPage extends BasePage {
  readonly path = '/products'

  readonly table: Locator

  constructor(page: Page) {
    super(page)
    this.table = page.getByRole('table').or(page.getByRole('grid')).first()
  }
}

import { type Page } from '@playwright/test'

import { MuiAutocomplete } from './components'
import { ProductsPage } from './products.page'

export class ProductGroupsPage extends ProductsPage {
  override readonly path = '/product-groups'

  constructor(page: Page) {
    super(page, true)
  }

  async addComponent(sku: string) {
    const input = this.page.getByPlaceholder('เลือกหรือค้นหาสินค้าเดี่ยวเพื่อเพิ่มเข้าชุด...', { exact: true })
    await new MuiAutocomplete(this.page, input).choose(sku, new RegExp(sku))
    await this.page.getByPlaceholder('จำนวน', { exact: true }).fill('2')
    await this.page.getByRole('button', { name: 'เพิ่มเข้าชุด', exact: true }).click()
  }
}

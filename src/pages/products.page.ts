import { type Page } from '@playwright/test'

import { type ProductInput } from '@data/factories'

import { Filter, MuiSelect } from './components'
import { InventoryListPage } from './inventory-list.page'

export class ProductsPage extends InventoryListPage {
  readonly path: string = '/products'

  constructor(page: Page, bundle = false) {
    super(
      page,
      bundle ? 'ค้นหาด้วย ชื่อสินค้าชุด, รหัส SKU, บาร์โค้ด...' : 'ค้นหาด้วย ชื่อสินค้า, รหัส SKU, บาร์โค้ด...',
      bundle ? 'เพิ่มสินค้าชุด' : 'เพิ่มรายการสินค้า',
    )
  }

  get nameTh() {
    return this.page.getByRole('textbox', { name: 'ชื่อสินค้า (ภาษาไทย)' })
  }
  get nameEn() {
    return this.page.getByRole('textbox', { name: 'ชื่อสินค้า (ภาษาอังกฤษ)' })
  }
  get sku() {
    return this.page.getByRole('textbox', { name: 'รหัส SKU (ไม่บังคับ - ระบบสร้างให้อัตโนมัติ)' })
  }

  get filter() {
    // This select has no label/name in ERP; its displayed placeholder is accessible text.
    return new Filter(new MuiSelect(this.page, this.page.getByRole('combobox').filter({ hasText: 'กลุ่มสินค้าทั้งหมด' })))
  }

  async fill(input: ProductInput, refs: { itemGroup: string; uom: string }) {
    await this.sku.fill(input.sku ?? '')
    await this.nameTh.fill(input.name_th)
    await this.nameEn.fill(input.name_en ?? '')
    await new MuiSelect(this.page, this.page.getByRole('combobox', { name: 'หมวดหมู่ / กลุ่มสินค้า' })).choose(refs.itemGroup)
    await new MuiSelect(this.page, this.page.getByRole('combobox', { name: 'หน่วยนับสต็อกหลัก' })).choose(refs.uom)
  }
}

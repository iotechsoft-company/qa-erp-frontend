import { type Page } from '@playwright/test'

import { type ItemGroupInput } from '@data/factories'

import { InventoryListPage } from './inventory-list.page'

export class ItemGroupsPage extends InventoryListPage {
  readonly path = '/item-groups'

  constructor(page: Page) {
    super(page, 'ค้นหากลุ่มสินค้า...', 'เพิ่มกลุ่มสินค้า', false)
  }

  get nameTh() {
    return this.page.getByRole('textbox', { name: 'ชื่อกลุ่มสินค้า (ภาษาไทย)' })
  }
  get nameEn() {
    return this.page.getByRole('textbox', { name: 'ชื่อกลุ่มสินค้า (ภาษาอังกฤษ)' })
  }

  async fillForm(input: ItemGroupInput) {
    await this.nameTh.fill(input.name_th)
    await this.nameEn.fill(input.name_en ?? '')
    await this.page.getByRole('switch', { name: 'เป็นกลุ่มหลัก (Group Node)' }).setChecked(input.is_group)
  }

  override async save() {
    await super.save(false)
  }
}

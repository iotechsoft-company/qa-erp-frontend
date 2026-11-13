import { expect, type Page } from '@playwright/test'
import { BasePage } from './base.page'
import { MuiAutocomplete, MuiSelect } from './components'
export type SalesMode = 'quotation' | 'order' | 'delivery'
const modeLabels = {
  quotation: 'ใบเสนอราคา (Quotation)',
  order: 'ใบสั่งขาย (Sales Order)',
  delivery: 'ใบส่งสินค้า (Delivery Note)',
}
const saveLabels = { quotation: 'บันทึกใบเสนอราคา', order: 'บันทึกใบสั่งขาย', delivery: 'บันทึกใบส่งสินค้า' }
export class SalesCreatePage extends BasePage {
  readonly path = '/sales'
  constructor(page: Page) {
    super(page)
  }
  get productInput() {
    return this.page.getByPlaceholder('ยิงบาร์โค้ด หรือค้นหาชื่อสินค้า / SKU...', { exact: true })
  }
  get customerInput() {
    return this.page.getByPlaceholder('เลือกหรือค้นหาลูกค้า...', { exact: true })
  }
  get documentDate() {
    return this.page.getByLabel('วันที่เอกสาร', { exact: false })
  }
  get validUntil() {
    return this.page.getByLabel('วันหมดอายุข้อเสนอ', { exact: false })
  }
  get remark() {
    return this.page.getByRole('textbox', { name: 'หมายเหตุ', exact: true })
  }
  get table() {
    return this.page.getByRole('table').first()
  }
  async selectMode(mode: SalesMode) {
    await new MuiSelect(this.page, this.page.getByRole('combobox', { name: 'ประเภทเอกสาร', exact: true })).choose(
      modeLabels[mode],
    )
  }
  async selectCustomer(code: string) {
    await new MuiAutocomplete(this.page, this.customerInput).choose(code, new RegExp(code))
  }
  async addProduct(sku: string) {
    await this.productInput.fill(sku)
    await this.page
      .getByRole('option')
      .filter({ has: this.page.getByText(sku, { exact: true }) })
      .click()
    await expect(this.table.getByRole('row').filter({ hasText: sku })).toBeVisible()
  }
  async setLine(sku: string, column: 'จำนวน' | 'ราคาขาย/หน่วย' | 'ส่วนลด', value: string) {
    const headers = await this.table.getByRole('columnheader').allTextContents()
    const index = headers.indexOf(column)
    if (index < 0) throw new Error(`No sales item column: ${column}`)
    await this.table
      .getByRole('row')
      .filter({ hasText: sku })
      .getByRole('cell')
      .nth(index)
      .getByRole('textbox')
      .fill(value)
  }
  async selectWarehouse(name: string) {
    await new MuiSelect(this.page, this.page.getByRole('combobox', { name: 'คลังสินค้าต้นทาง' })).choose(name)
  }
  saveButton(mode: SalesMode) {
    return this.page.getByRole('button', { name: saveLabels[mode], exact: true })
  }
  async save(mode: SalesMode) {
    await this.saveButton(mode).click()
  }
  async submitQuotation() {
    const result = this.page.waitForResponse(
      (res) => new URL(res.url()).pathname === '/api/sales-bc/v1/quotations' && res.request().method() === 'POST',
    )
    await this.save('quotation')
    const response = await result
    expect(response.ok()).toBe(true)
    const json = (await response.json()) as { data: { id: string; attributes: { quotation_number: string } } }
    await expect(this.page.getByRole('dialog')).toBeVisible()
    return { id: json.data.id, number: json.data.attributes.quotation_number }
  }
}

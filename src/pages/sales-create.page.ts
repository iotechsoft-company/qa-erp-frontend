import { expect, type Page } from '@playwright/test'
import { BasePage } from './base.page'
import { DataTable, MuiAutocomplete, MuiSelect } from './components'
export type SalesMode = 'quotation' | 'order' | 'delivery'
const modeLabels = {
  quotation: 'ใบเสนอราคา (Quotation)',
  order: 'ใบสั่งขาย (Sales Order)',
  delivery: 'ใบส่งสินค้า (Delivery Note)',
}
const saveLabels = { quotation: 'บันทึกใบเสนอราคา', order: 'บันทึกใบสั่งขาย', delivery: 'บันทึกใบส่งสินค้า' }
export class SalesCreatePage extends BasePage {
  readonly path = '/sales'
  readonly dataTable: DataTable
  constructor(page: Page) {
    super(page)
    this.dataTable = new DataTable(page)
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
    return this.dataTable.root
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
    await expect(this.itemRow(sku)).toBeVisible()
  }
  private itemRow(sku: string) {
    return this.table.getByRole('row').filter({ has: this.page.getByText(`SKU: ${sku}`, { exact: true }) })
  }
  async setLine(sku: string, column: 'จำนวน' | 'ราคาขาย/หน่วย' | 'ส่วนลด', value: string) {
    const cell = await this.dataTable.cell(this.itemRow(sku), column)
    await cell.getByRole('textbox').fill(value)
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
  async submit(mode: SalesMode) {
    const resource = mode === 'delivery' ? 'delivery-notes' : 'quotations'
    const result = this.page.waitForResponse(
      (res) => new URL(res.url()).pathname === `/api/sales-bc/v1/${resource}` && res.request().method() === 'POST',
    )
    await this.save(mode)
    return result
  }
}

import { expect, type Page } from '@playwright/test'
import { BasePage } from './base.page'
import { DataTable, MuiAutocomplete, MuiSelect } from './components'
export class PurchaseCreatePage extends BasePage {
  readonly path = '/purchasing/create'
  readonly dataTable: DataTable
  constructor(page: Page) {
    super(page)
    this.dataTable = new DataTable(page)
  }
  get mode() {
    return this.page.getByRole('combobox', { name: 'ประเภทเอกสาร', exact: true })
  }
  get documentDate() {
    return this.page.getByRole('textbox', { name: 'วันที่เอกสาร', exact: true })
  }
  get remark() {
    return this.page.getByRole('textbox', { name: 'หมายเหตุ', exact: true })
  }
  get supplierInput() {
    return this.page.getByPlaceholder('เลือกหรือค้นหาผู้จัดส่ง...', { exact: true })
  }
  get productInput() {
    return this.page.getByPlaceholder('ยิงบาร์โค้ด หรือพิมพ์ค้นหาชื่อสินค้า / SKU...', { exact: true })
  }
  async selectMode(mode: 'po' | 'gr') {
    await new MuiSelect(this.page, this.mode).choose(
      mode === 'po' ? 'ใบสั่งซื้อ (Purchase Order)' : 'ใบจัดซื้อรับสินค้าเข้า (Goods Receipt)',
    )
  }
  async selectSupplier(code: string) {
    await new MuiAutocomplete(this.page, this.supplierInput).choose(code, new RegExp(code))
  }
  async selectWarehouse(label: string) {
    await new MuiSelect(this.page, this.page.getByRole('combobox', { name: 'คลังสินค้าปลายทาง', exact: true })).choose(
      label,
    )
  }
  itemRow(sku: string) {
    return this.dataTable.root.getByRole('row').filter({ has: this.page.getByText(`SKU: ${sku}`, { exact: true }) })
  }
  async addProduct(sku: string) {
    await this.productInput.fill(sku)
    await this.page.getByRole('option').filter({ hasText: sku }).click()
    await expect(this.itemRow(sku)).toBeVisible()
  }
  async setLine(sku: string, column: 'จำนวน' | 'ราคาทุน/หน่วย', value: string) {
    await (await this.dataTable.cell(this.itemRow(sku), column)).getByRole('textbox').fill(value)
  }
  saveButton(mode: 'po' | 'gr') {
    return this.page.getByRole('button', { name: mode === 'po' ? 'บันทึกใบสั่งซื้อ' : 'บันทึกรับเข้าคลังสินค้า', exact: true })
  }
  async submit(mode: 'po' | 'gr') {
    const result = this.page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' &&
        (mode === 'po'
          ? new URL(res.url()).pathname === '/api/supplier-bc/v1/purchase-orders'
          : /\/goods-receipts\/[^/]+\/submit$/.test(new URL(res.url()).pathname)),
    )
    await this.saveButton(mode).click()
    const response = await result
    expect(response.ok()).toBe(true)
    await expect(this.page.getByRole('dialog')).toBeVisible()
    return (await response.json()) as { data: { id: string; attributes: { po_number?: string; grn_number?: string } } }
  }
}

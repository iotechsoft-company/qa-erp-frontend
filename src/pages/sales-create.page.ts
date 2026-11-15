import { expect, type Page, type Response } from '@playwright/test'
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
  get successDialog() {
    return this.page
      .getByRole('dialog')
      .filter({ has: this.page.getByRole('heading', { name: 'ทำรายการขายสำเร็จ', exact: true }) })
  }
  /** Observe the complete UI chain and fail on its first failed POST, including approvals. */
  async create(mode: SalesMode) {
    const responses: Response[] = []
    let rejectFailure!: (error: Error) => void
    const failure = new Promise<never>((_, reject) => {
      rejectFailure = reject
    })
    // The handler can see an error while click is still resolving; never leave an unhandled rejection.
    void failure.catch(() => {})
    const inChain = (path: string) =>
      /^\/api\/sales-bc\/v1\/(quotations(?:\/[^/]+\/(send|approve|convert-to-sales-order))?|delivery-notes|sales-orders\/[^/]+\/approve)$/.test(
        path,
      )
    const observe = (response: Response) => {
      const path = new URL(response.url()).pathname
      if (response.request().method() !== 'POST' || !inChain(path)) return
      responses.push(response)
      if (!response.ok()) rejectFailure(new Error(`Sales create POST ${path} returned ${response.status()}`))
    }
    this.page.on('response', observe)
    const initial = this.page.waitForResponse(
      (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/sales-bc/v1/quotations',
    )
    void initial.catch(() => {})
    const operation = (async () => {
      await this.save(mode)
      expect((await initial).status()).toBe(201)
      // Success is the completion barrier, including any PENDING_APPROVAL→approve follow-up.
      await expect(this.successDialog).toBeVisible()
      const response = [...responses].reverse().find((res) => {
        const path = new URL(res.url()).pathname
        return mode === 'order'
          ? path.endsWith('/convert-to-sales-order') || /\/sales-orders\/[^/]+\/approve$/.test(path)
          : path === `/api/sales-bc/v1/${mode === 'delivery' ? 'delivery-notes' : 'quotations'}`
      })
      if (!response) throw new Error(`Sales create ${mode}: success dialog without final response`)
      expect(response.ok()).toBe(true)
      const json = await response.json()
      const field = { quotation: 'quotation_number', order: 'so_number', delivery: 'dn_number' }[mode]
      const number = json.data?.attributes?.[field]
      if (typeof number !== 'string' || !number.trim()) throw new Error(`Sales create response missing ${field}`)
      await expect(this.successDialog).toContainText(number)
      return response
    })()
    try {
      return await Promise.race([operation, failure])
    } finally {
      this.page.off('response', observe)
    }
  }
}

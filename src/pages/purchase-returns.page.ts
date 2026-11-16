import { expect, type Page } from '@playwright/test'
import { BasePage } from './base.page'
import { GoodsReceiptsPage } from './purchase-documents.page'
import { DataTable } from './components'
import { bangkokDate } from '@data/dates'

export class PurchaseReturnsPage extends BasePage {
  readonly path = '/purchasing/goods-receipts'
  readonly receipts: GoodsReceiptsPage
  readonly table: DataTable
  constructor(page: Page) {
    super(page)
    this.receipts = new GoodsReceiptsPage(page)
    this.table = new DataTable(page)
  }
  override async goto() {
    await this.receipts.goto()
  }
  get form() {
    return this.page
      .getByRole('dialog')
      .filter({ has: this.page.getByRole('heading', { name: 'สร้างใบส่งคืนสินค้า (Purchase Return)', exact: true }) })
  }
  get details() {
    return this.page
      .getByRole('dialog')
      .filter({ has: this.page.getByRole('heading', { name: 'รายละเอียดการส่งคืนสินค้า', exact: true }) })
  }
  get confirm() {
    return this.form.getByRole('button', { name: 'ยืนยันส่งคืนสินค้า', exact: true })
  }
  async receiptDetails(grnNumber: string) {
    await this.receipts.completed()
    await this.receipts.search(grnNumber)
    await this.receipts.openDetails(grnNumber)
  }
  get returnAction() {
    return this.page.getByRole('dialog').getByRole('button', { name: /ส่งคืนสินค้า|completedTable\.return/ })
  }
  async open(grnNumber: string) {
    await this.receiptDetails(grnNumber)
    await this.returnAction.click()
    await expect(this.form).toBeVisible()
  }
  async qty(sku: string, value: number) {
    const row = this.form.getByRole('row').filter({ has: this.page.getByText(`SKU: ${sku}`, { exact: true }) })
    await expect(row).toHaveCount(1)
    await row.getByRole('spinbutton').fill(String(value))
  }
  async create(sku: string, qty: number, reason: string) {
    await this.qty(sku, qty)
    await this.form.getByRole('textbox', { name: 'เหตุผลการส่งคืน', exact: true }).fill(reason)
    await this.form.getByLabel('วันที่รับเข้า', { exact: true }).fill(bangkokDate())
    const first = this.page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === '/api/inventory-bc/v1/purchase-returns' && res.request().method() === 'POST',
    )
    const final = this.page.waitForResponse(
      (res) =>
        /\/purchase-returns\/[^/]+\/submit$/.test(new URL(res.url()).pathname) && res.request().method() === 'POST',
    )
    void final.catch(() => {})
    await this.confirm.click()
    expect((await first).status()).toBe(201)
    const posted = await final
    expect(posted.ok()).toBe(true)
    await expect(this.form).toBeHidden()
    return (await posted.json()) as { data: { id: string; attributes: { prn_number: string; status: string } } }
  }
  async history() {
    await this.page.getByRole('tab', { name: /^ประวัติส่งคืนสินค้า/ }).click()
    await expect(this.table.root.getByRole('columnheader', { name: 'เลขที่ใบส่งคืน', exact: true })).toBeVisible()
  }
  async search(number: string) {
    const result = this.page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === '/api/inventory-bc/v1/purchase-returns' &&
        res.request().method() === 'GET' &&
        [...new URL(res.url()).searchParams.values()].some((value) => value.includes(number)),
    )
    await this.receipts.searchInput.fill(number)
    expect((await result).ok()).toBe(true)
    await (await result).finished()
    await expect(this.table.row(number)).toBeVisible()
  }
  async view(number: string) {
    await this.table.row(number).getByRole('button', { name: 'ดูรายละเอียด', exact: true }).click()
    await expect(this.details).toContainText(number)
  }
}

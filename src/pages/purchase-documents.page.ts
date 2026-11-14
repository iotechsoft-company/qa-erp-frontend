import { expect, type Page } from '@playwright/test'
import { BasePage } from './base.page'
import { DataTable, MuiSelect, Notification } from './components'

export class PurchaseDocumentsPage extends BasePage {
  readonly path: string
  readonly dataTable: DataTable
  readonly notification: Notification
  private receiptTab = false
  private selectedStatus = 'สถานะ ทั้งหมด'
  constructor(
    page: Page,
    readonly kind: 'orders' | 'goods-receipts',
  ) {
    super(page)
    this.path = `/purchasing/${kind}`
    this.dataTable = new DataTable(page)
    this.notification = new Notification(this.alert)
  }
  get endpoint() {
    return this.receiptTab ? '/api/inventory-bc/v1/goods-receipts' : '/api/supplier-bc/v1/purchase-orders'
  }
  get numberField() {
    return this.receiptTab ? ('grn_number' as const) : ('po_number' as const)
  }
  get numberColumn() {
    return this.receiptTab ? 'เลขที่ใบรับสินค้า' : 'เลขที่ใบสั่งซื้อ'
  }
  get emptyText() {
    return this.receiptTab
      ? 'ไม่พบรายการที่รับเข้าสต็อกแล้ว'
      : this.kind === 'orders'
        ? 'ไม่พบรายการใบสั่งซื้อ'
        : 'ไม่พบรายการใบสั่งซื้อที่รอรับเข้าสต็อก'
  }
  get searchInput() {
    return this.page.getByPlaceholder('ค้นหารหัส PO, GRN, PRN หรือเลขที่เอกสาร...', { exact: true })
  }
  get dialog() {
    return this.page.getByRole('dialog')
  }
  override async goto() {
    this.receiptTab = false
    this.selectedStatus = 'สถานะ ทั้งหมด'
    await super.goto()
    await expect(
      this.page.getByRole('heading', {
        name: this.kind === 'orders' ? 'รายการใบสั่งซื้อสินค้า' : 'รับสินค้าเข้าสต็อก',
        exact: true,
      }),
    ).toBeVisible()
    await this.ready()
  }
  async ready() {
    await expect(
      this.dataTable.root
        .getByRole('button')
        .first()
        .or(this.dataTable.root.getByText(this.emptyText, { exact: true })),
    ).toBeVisible()
  }
  async completed() {
    await this.page.getByRole('tab', { name: /^รับเข้าสต็อกแล้ว/ }).click()
    this.receiptTab = true
    await this.ready()
  }
  async search(text: string) {
    const result = this.page.waitForResponse((res) => {
      const url = new URL(res.url())
      return (
        url.pathname === this.endpoint &&
        [...url.searchParams.values()].some((value) => value.includes(`${this.numberField}||$cont||${text}`)) &&
        res.request().method() === 'GET'
      )
    })
    await this.searchInput.fill(text)
    const response = await result
    expect(response.ok()).toBe(true)
    await response.finished()
  }
  async filterStatus(label: string, status: string) {
    const result = this.page.waitForResponse((res) => {
      const url = new URL(res.url())
      return (
        url.pathname === this.endpoint &&
        [...url.searchParams.values()].some((value) => value.includes(`status||$eq||${status}`))
      )
    })
    await new MuiSelect(this.page, this.page.getByRole('combobox').filter({ hasText: this.selectedStatus })).choose(
      label,
    )
    this.selectedStatus = label
    expect((await result).ok()).toBe(true)
    await this.ready()
  }
  async openDetails(number: string) {
    await this.dataTable
      .row(number)
      .getByRole('button', {
        name: this.receiptTab || this.kind === 'orders' ? 'ดูรายละเอียด' : 'รายละเอียด',
        exact: true,
      })
      .click()
    await expect(this.dialog).toContainText(number)
  }
  async closeDialog() {
    const title = await this.dialog.getByRole('heading').first().innerText()
    const current = this.page.getByRole('dialog', { name: title, exact: true })
    await current.getByRole('button', { name: 'ปิด', exact: true }).filter({ hasText: 'ปิด' }).click()
    await expect(current).toBeHidden()
  }
  async lifecycle(number: string, action: 'approve' | 'send') {
    const result = this.page.waitForResponse(
      (res) => new URL(res.url()).pathname.endsWith(`/${action}`) && res.request().method() === 'POST',
    )
    await this.dataTable
      .row(number)
      .getByRole('button', { name: action === 'approve' ? 'อนุมัติ' : 'ส่งเอกสาร', exact: true })
      .click()
    expect((await result).ok()).toBe(true)
  }
  async openCancel(number: string) {
    await this.openDetails(number)
    await this.dialog.getByRole('button', { name: /ยกเลิก/ }).click()
    await expect(this.dialog.getByRole('textbox', { name: 'เหตุผลในการยกเลิก' })).toBeVisible()
  }
  get cancelReason() {
    return this.dialog.getByRole('textbox', { name: 'เหตุผลในการยกเลิก' })
  }
  get confirmCancel() {
    return this.dialog.getByRole('button', { name: 'ยืนยันยกเลิก', exact: true })
  }
  async cancel(number: string, reason: string) {
    await this.openCancel(number)
    await this.confirmCancellation(reason)
  }
  async confirmCancellation(reason: string) {
    await this.cancelReason.fill(reason)
    const result = this.page.waitForResponse(
      (res) => new URL(res.url()).pathname.endsWith('/cancel') && res.request().method() === 'POST',
    )
    await this.confirmCancel.click()
    expect((await result).ok()).toBe(true)
    await expect(this.dialog).toBeHidden()
  }
  async openReceive(number: string) {
    await this.dataTable.row(number).getByRole('button', { name: 'รับสินค้า', exact: true }).click()
    await expect(this.dialog).toContainText('ยืนยันการรับสินค้าเข้าสต็อก')
  }
  async receiptCell(column: string) {
    const table = this.dialog.getByRole('table')
    const columns = await table.getByRole('columnheader').allTextContents()
    const index = columns.indexOf(column)
    if (index < 0) throw new Error(`Unknown receive column ${column}`)
    return table.locator('tbody').getByRole('row').getByRole('cell').nth(index)
  }
  async receive(warehouseLabel: string, remark: string, lot: string) {
    await new MuiSelect(this.page, this.dialog.getByRole('combobox', { name: 'คลังสินค้าปลายทาง' })).choose(warehouseLabel)
    await this.dialog.getByRole('textbox', { name: 'หมายเหตุการรับเข้า' }).fill(remark)
    await (await this.receiptCell('เลขที่ล็อต (Lot No.)')).getByRole('textbox').fill(lot)
    const result = this.page.waitForResponse(
      (res) =>
        /\/goods-receipts\/[^/]+\/submit$/.test(new URL(res.url()).pathname) && res.request().method() === 'POST',
    )
    await this.dialog.getByRole('button', { name: 'ยืนยันรับเข้าสต็อก', exact: true }).click()
    const response = await result
    expect(response.ok()).toBe(true)
    await expect(this.dialog).toBeHidden()
    return (await response.json()) as { data: { id: string; attributes: { grn_number: string } } }
  }
  async expectPagination() {
    await this.dataTable.expectPagination(this.emptyText, {
      endpoint: this.endpoint,
      column: this.numberColumn,
      field: this.numberField,
    })
  }
}
export class PurchaseOrdersPage extends PurchaseDocumentsPage {
  constructor(page: Page) {
    super(page, 'orders')
  }
}
export class GoodsReceiptsPage extends PurchaseDocumentsPage {
  constructor(page: Page) {
    super(page, 'goods-receipts')
  }
}

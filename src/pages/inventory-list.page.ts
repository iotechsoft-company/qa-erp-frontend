import { expect, type Page } from '@playwright/test'

import { BasePage } from './base.page'
import { ConfirmDialog, DataTable, Notification, SearchBox } from './components'

export abstract class InventoryListPage extends BasePage {
  readonly dataTable: DataTable
  readonly table
  readonly search: SearchBox
  readonly confirmDialog: ConfirmDialog
  readonly notification: Notification

  constructor(
    page: Page,
    placeholder: string,
    private readonly createText: string,
    buttonSearch = true,
  ) {
    super(page)
    this.dataTable = new DataTable(page)
    this.table = this.dataTable.root
    this.search = new SearchBox(
      page,
      placeholder,
      `/api/inventory-bc/v1/${buttonSearch ? 'products' : 'item-groups'}`,
      buttonSearch,
    )
    this.confirmDialog = new ConfirmDialog(page)
    this.notification = new Notification(this.alert)
  }

  override async waitForReady() {
    await super.waitForReady()
    await expect(this.table).toBeVisible()
    // An empty/skeleton table mounts before its data and pagination are available.
    await expect(
      this.table
        .getByRole('button', { name: 'แก้ไข', exact: true })
        .first()
        .or(this.table.getByText(/^ไม่พบรายการ/)),
    ).toBeVisible()
    await expect(this.page.getByRole('button', { name: this.createText, exact: true })).toBeEnabled()
  }

  async expectSearchExisting(column: string) {
    const rows = this.table
      .getByRole('row')
      .filter({ has: this.page.getByRole('button', { name: 'แก้ไข', exact: true }) })
    if (!(await rows.count())) {
      await expect(this.table.getByText(/^ไม่พบรายการ/)).toBeVisible()
      return
    }
    const headers = await this.table.getByRole('columnheader').allTextContents()
    const index = headers.indexOf(column)
    if (index < 0) throw new Error(`Unknown table column: ${column}`)
    const value = await rows.first().getByRole('cell').nth(index).innerText()
    await this.search.search(value)
    await expect(this.table.getByRole('cell', { name: value, exact: true }).first()).toBeVisible()
  }

  async openCreate() {
    await this.page.getByRole('button', { name: this.createText, exact: true }).click()
  }

  async edit(identifier: string) {
    await this.dataTable.row(identifier).getByRole('button', { name: 'แก้ไข', exact: true }).click()
  }

  async delete(identifier: string, confirmText = 'ลบ') {
    await this.dataTable.row(identifier).getByRole('button', { name: 'ลบ', exact: true }).click()
    const refreshed = this.waitForListRefresh()
    const deleted = this.page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.startsWith('/api/inventory-bc/v1/') &&
        response.request().method() === 'DELETE',
    )
    const [result] = await Promise.all([deleted, refreshed, this.confirmDialog.confirm(confirmText)])
    expect(result.ok()).toBe(true)
  }

  /** For valid forms only; validation tests use save() because they must not send a request. */
  async submit(edit = false) {
    const resource = this.path === '/item-groups' ? 'item-groups' : 'products'
    const refreshed = this.waitForListRefresh()
    const response = this.page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname.startsWith(`/api/inventory-bc/v1/${resource}`) &&
        res.request().method() === (edit ? 'PUT' : 'POST'),
    )
    const [result] = await Promise.all([response, refreshed, this.save(edit)])
    expect(result.ok()).toBe(true)
    await expect(
      this.page.getByRole('button', {
        name: edit && resource === 'products' ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล',
        exact: true,
      }),
    ).toBeHidden()

    return result
  }

  private async waitForListRefresh() {
    const started = Date.now()
    const resource = this.path === '/item-groups' ? 'item-groups' : 'products'
    const response = await this.page.waitForResponse((res) => {
      const url = new URL(res.url())
      return (
        url.pathname === `/api/inventory-bc/v1/${resource}` &&
        url.searchParams.get('limit') === '10' &&
        res.request().method() === 'GET' &&
        res.request().timing().startTime >= started
      )
    })
    expect(response.ok()).toBe(true)
    await response.finished()
    const body = (await response.json()) as { data: { attributes: { name: { th: string } } }[] }
    const column = resource === 'item-groups' ? 'ชื่อภาษาไทย' : 'ชื่อสินค้า'
    await expect.poll(() => this.dataTable.readColumn(column)).toEqual(body.data.map((row) => row.attributes.name.th))
  }

  async save(edit = false) {
    await this.page.getByRole('button', { name: edit ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล', exact: true }).click()
  }
}

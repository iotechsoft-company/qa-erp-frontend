import { expect, type Page } from '@playwright/test'
import { BasePage } from './base.page'
import { DataTable, MuiSelect, Notification } from './components'

export type SalesListConfig = {
  path: string
  resource: string
  title: string
  placeholder: string
  empty: string
  numberColumn: string
  numberField: 'quotation_number' | 'so_number' | 'dn_number'
}
export abstract class SalesDocumentListPage extends BasePage {
  readonly path: string
  readonly dataTable: DataTable
  readonly notification: Notification
  private selectedStatus = 'ทุกสถานะ'
  constructor(
    page: Page,
    readonly config: SalesListConfig,
  ) {
    super(page)
    this.path = config.path
    this.dataTable = new DataTable(page)
    this.notification = new Notification(this.alert)
  }
  get table() {
    return this.dataTable.root
  }
  get endpoint() {
    return `/api/sales-bc/v1/${this.config.resource}`
  }
  get searchInput() {
    return this.page.getByPlaceholder(this.config.placeholder, { exact: true })
  }
  get details() {
    return this.page.getByRole('dialog')
  }
  override async goto() {
    this.selectedStatus = 'ทุกสถานะ'
    await super.goto()
  }
  override async waitForReady() {
    await super.waitForReady()
    await expect(this.page.getByRole('heading', { name: this.config.title, exact: true })).toBeVisible()
    await expect(
      this.table
        .getByRole('button', { name: 'ดูรายละเอียด', exact: true })
        .first()
        .or(this.table.getByText(this.config.empty, { exact: true })),
    ).toBeVisible()
  }
  async searchResponse(text: string) {
    const result = this.page.waitForResponse((res) => {
      const url = new URL(res.url())
      return (
        url.pathname === this.endpoint &&
        res.request().method() === 'GET' &&
        (url.searchParams.get('s') ?? '').includes(text)
      )
    })
    await this.searchInput.fill(text)
    const response = await result
    await response.finished()
    return response
  }
  pageStatusFilter() {
    return this.page.getByRole('combobox').filter({ hasText: this.selectedStatus })
  }
  async filterStatus(label: string, status: string) {
    const result = this.page.waitForResponse((res) => {
      const url = new URL(res.url())
      return url.pathname === this.endpoint && [...url.searchParams.values()].includes(`status||$eq||${status}`)
    })
    await new MuiSelect(this.page, this.page.getByRole('combobox').filter({ hasText: this.selectedStatus })).choose(
      label,
    )
    this.selectedStatus = label
    expect((await result).ok()).toBe(true)
  }
  /** User-visible pagination fallback while the app's document search is broken. */
  async findRecord(number: string) {
    let pageNumber = 1
    while (true) {
      const numbers = await this.dataTable.readColumn(this.config.numberColumn)
      if (numbers.includes(number)) {
        await expect(this.dataTable.row(number)).toBeVisible()
        return
      }
      if (!(await this.dataTable.next.count()) || !(await this.dataTable.next.isEnabled())) {
        throw new Error(`Document ${number} not found after scanning ${pageNumber} UI page(s); reached last page`)
      }
      const result = this.page.waitForResponse((res) => {
        const url = new URL(res.url())
        return url.pathname === this.endpoint && url.searchParams.get('page') === String(pageNumber + 1)
      })
      await this.dataTable.next.click()
      const response = await result
      pageNumber += 1
      expect(response.ok()).toBe(true)
      const json = (await response.json()) as { data: { attributes: Record<string, string> }[] }
      await expect
        .poll(() => this.dataTable.readColumn(this.config.numberColumn))
        .toEqual(json.data.map((row) => row.attributes[this.config.numberField]))
    }
  }

  async openDetails(number: string) {
    await this.dataTable.row(number).getByRole('button', { name: 'ดูรายละเอียด', exact: true }).click()
    await expect(this.details).toContainText(number)
  }
  async closeDetails() {
    await this.details.getByRole('button', { name: 'ปิด', exact: true }).filter({ hasText: 'ปิด' }).click()
    await expect(this.details).toBeHidden()
  }
  async action(number: string, label: string, action: string) {
    const result = this.page.waitForResponse(
      (res) => new URL(res.url()).pathname.endsWith(`/${action}`) && res.request().method() === 'POST',
    )
    await this.dataTable.row(number).getByRole('button', { name: label, exact: true }).click()
    const response = await result
    expect(response.ok()).toBe(true)
    return response.json() as Promise<{ data: { id: string; attributes: Record<string, unknown> } }>
  }
  async expectPagination() {
    await this.dataTable.expectPagination(this.config.empty, {
      endpoint: this.endpoint,
      column: this.config.numberColumn,
      field: this.config.numberField,
    })
  }
}

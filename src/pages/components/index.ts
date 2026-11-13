import { expect, type Locator, type Page } from '@playwright/test'

/** Shared MUI table: row actions are scoped to the identifying cell, never a row index. */
export class DataTable {
  readonly root: Locator
  readonly next: Locator
  readonly previous: Locator

  constructor(private readonly page: Page) {
    this.root = page.getByRole('table').first()
    this.next = page.getByRole('button', { name: 'Go to next page', exact: true })
    this.previous = page.getByRole('button', { name: 'Go to previous page', exact: true })
  }

  row(text: string) {
    return this.root.getByRole('row').filter({ has: this.page.getByRole('cell', { name: text, exact: true }) })
  }

  async readRows() {
    return this.root.locator('tbody').getByRole('row').allTextContents()
  }

  async readColumn(column: string) {
    await expect(this.root.getByRole('columnheader', { name: column, exact: true })).toBeVisible()
    const headers = await this.root.getByRole('columnheader').allTextContents()
    const index = headers.indexOf(column)
    if (index < 0) throw new Error(`Unknown column: ${column}`)
    // Empty/loading rows use a single colspan cell rather than one cell per column.
    const rows = this.root
      .locator('tbody')
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell').nth(headers.length - 1) })
    const values: string[] = []
    for (const row of await rows.all()) values.push(await row.getByRole('cell').nth(index).innerText())
    return values
  }

  async sort(column: string) {
    // Only tables whose columns set sortable AND supply onSort render this button.
    await this.root.getByRole('columnheader', { name: column, exact: true }).getByRole('button').click()
  }

  async expectPagination(
    emptyText: string,
    identity?: { endpoint: string; column: string; field: 'code' | 'quotation_number' | 'so_number' | 'dn_number' },
  ) {
    if (!(await this.next.count())) {
      await expect(this.root.getByText(emptyText, { exact: true })).toBeVisible()
      return
    }
    if (!(await this.next.isEnabled())) {
      await expect(this.next).toBeDisabled()
      await expect(this.previous).toBeDisabled()
      return
    }
    const response = this.page.waitForResponse((res) => {
      const url = new URL(res.url())
      return (
        (identity ? url.pathname === identity.endpoint : url.pathname.startsWith('/api/inventory-bc/v1/')) &&
        url.searchParams.get('page') === '2' &&
        res.request().method() === 'GET'
      )
    })
    await this.goToPage(2)
    const result = await response
    expect(result.ok()).toBe(true)
    const json = (await result.json()) as {
      data: {
        attributes: {
          sku?: string
          code?: string
          quotation_number?: string
          so_number?: string
          dn_number?: string
          name: { th: string }
        }
      }[]
    }
    const column = identity?.column ?? (json.data[0]?.attributes.sku ? 'รหัส SKU' : 'ชื่อภาษาไทย')
    const values = json.data.map((row) =>
      identity ? row.attributes[identity.field] : (row.attributes.sku ?? row.attributes.name.th),
    )
    await expect.poll(() => this.readColumn(column)).toEqual(values)
    await this.previous.click()
    await expect(this.page.getByRole('button', { name: 'page 1', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(this.previous).toBeDisabled()
  }

  async goToPage(number: number) {
    await this.page.getByRole('button', { name: `Go to page ${number}`, exact: true }).click()
    await expect(this.page.getByRole('button', { name: `page ${number}`, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  }
}

export class SearchBox {
  readonly input: Locator

  constructor(
    private readonly page: Page,
    placeholder: string,
    private readonly resultPath: string,
    private readonly submitWithButton = true,
  ) {
    this.input = page.getByPlaceholder(placeholder, { exact: true })
  }

  async search(text: string) {
    // A matching row may already be in the previous result set. Finish the submitted
    // query before a caller opens edit/delete, otherwise it can race the mutation.
    const results = this.page.waitForResponse((res) => {
      const url = new URL(res.url())
      return (
        url.pathname === this.resultPath &&
        res.request().method() === 'GET' &&
        [...url.searchParams.values()].some((value) => value.includes(`||$cont||${text}`))
      )
    })
    await this.input.fill(text)
    // Dismiss freeSolo suggestions without selecting an existing product.
    await this.input.press('Escape')
    if (this.submitWithButton) {
      await this.page.getByRole('button', { name: 'ค้นหา', exact: true }).click()
    } else {
      await this.input.press('Enter')
    }
    const response = await results
    expect(response.ok()).toBe(true)
    await response.finished()
  }
}

export class MuiSelect {
  constructor(
    private readonly page: Page,
    readonly control: Locator,
  ) {}

  async choose(label: string) {
    await this.control.click()
    await this.page.getByRole('option', { name: label, exact: true }).click()
    await expect(this.page.getByRole('listbox')).toBeHidden()
  }
}

export class MuiAutocomplete {
  constructor(
    private readonly page: Page,
    readonly input: Locator,
  ) {}

  async choose(search: string, option: string | RegExp) {
    await this.input.fill(search)
    await this.page.getByRole('option', { name: option, exact: typeof option === 'string' }).click()
  }
}

/** Inventory uses an inline select filter, rather than a filter drawer. */
export class Filter {
  constructor(readonly select: MuiSelect) {}

  async apply(label: string) {
    await this.select.choose(label)
  }
}

export class ConfirmDialog {
  readonly root: Locator

  constructor(page: Page) {
    this.root = page.getByRole('dialog')
  }

  async confirm(name = 'ลบ') {
    await expect(this.root).toBeVisible()
    await this.root.getByRole('button', { name, exact: true }).click()
    await expect(this.root).toBeHidden()
  }

  async cancel() {
    await this.root.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
    await expect(this.root).toBeHidden()
  }
}

export class Notification {
  // Receive BasePage.alert so the hidden Next.js route announcer is excluded.
  constructor(readonly root: Locator) {}

  async expectMessage(message: string) {
    await expect(this.root.filter({ hasText: message })).toBeVisible()
  }
}

import { expect, type Page } from '@playwright/test'
import { SalesDocumentListPage } from './sales-document-list.page'
export class DeliveryNotesPage extends SalesDocumentListPage {
  constructor(page: Page) {
    super(page, {
      path: '/sales/delivery-notes',
      resource: 'delivery-notes',
      title: 'รายการส่งสินค้า (Delivery Notes)',
      placeholder: 'ค้นหาเลขที่ใบส่งสินค้า (DN)...',
      empty: 'ไม่พบรายการใบส่งสินค้า',
      numberColumn: 'เลขที่ใบส่งของ',
      numberField: 'dn_number',
    })
  }
  async openCancel(number: string) {
    await this.dataTable.row(number).getByRole('button', { name: 'ยกเลิก', exact: true }).click()
    await expect(this.details).toContainText('ยืนยันการยกเลิกใบส่งสินค้า')
  }
  get cancelReason() {
    return this.page.getByPlaceholder('ระบุเหตุผลการยกเลิก...', { exact: true })
  }
  get confirmCancel() {
    return this.details.getByRole('button', { name: 'ยืนยันยกเลิก', exact: true })
  }
  async cancel(number: string, reason: string) {
    await this.openCancel(number)
    await this.cancelReason.fill(reason)
    const result = this.page.waitForResponse(
      (res) => new URL(res.url()).pathname.endsWith('/cancel') && res.request().method() === 'POST',
    )
    await this.confirmCancel.click()
    expect((await result).ok()).toBe(true)
    await expect(this.details).toBeHidden()
  }
  private async confirmedResponse(number: string, action: 'submit' | 'approve', id?: string) {
    const labels = {
      submit: { row: 'ยืนยันส่ง', title: 'ยืนยันการส่งของ', confirm: 'ยืนยันส่งของ' },
      approve: { row: 'อนุมัติ', title: 'ยืนยันการอนุมัติ', confirm: 'ยืนยันอนุมัติ' },
    }[action]
    await this.dataTable.row(number).getByRole('button', { name: labels.row, exact: true }).click()
    const dialog = this.page.getByRole('dialog').filter({
      has: this.page.getByRole('heading', { name: labels.title, exact: true }),
    })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(number)
    const result = this.page.waitForResponse((res) => {
      const path = new URL(res.url()).pathname
      const matches = id
        ? path === `${this.endpoint}/${id}/${action}`
        : path.startsWith(`${this.endpoint}/`) && path.endsWith(`/${action}`)
      return matches && res.request().method() === 'POST'
    })
    await dialog.getByRole('button', { name: labels.confirm, exact: true }).click()
    const response = await result
    await expect(dialog).toBeHidden()
    return response
  }
  /** Preserve the actual rejection for stock/state guard assertions after UI confirmation. */
  async attemptSubmit(number: string, id: string) {
    return this.confirmedResponse(number, 'submit', id)
  }
  private async postConfirmed(number: string, action: 'submit' | 'approve') {
    const response = await this.confirmedResponse(number, action)
    expect(response.ok()).toBe(true)
    return response.json() as Promise<{ data: { id: string; attributes: Record<string, unknown> } }>
  }
  async submit(number: string) {
    return this.postConfirmed(number, 'submit')
  }
  async approve(number: string) {
    return this.postConfirmed(number, 'approve')
  }
}

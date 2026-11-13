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
  async submit(number: string) {
    return this.action(number, 'ยืนยันส่ง', 'submit')
  }
  async approve(number: string) {
    return this.action(number, 'อนุมัติ', 'approve')
  }
}

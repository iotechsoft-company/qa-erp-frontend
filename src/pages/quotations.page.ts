import { type Page } from '@playwright/test'
import { SalesDocumentListPage } from './sales-document-list.page'
export class QuotationsPage extends SalesDocumentListPage {
  constructor(page: Page) {
    super(page, {
      path: '/sales/quotations',
      resource: 'quotations',
      title: 'ใบเสนอราคา (Quotations)',
      placeholder: 'ค้นหาเลขที่ใบเสนอราคา (QT)...',
      empty: 'ไม่พบรายการใบเสนอราคา',
      numberColumn: 'เลขที่ใบเสนอราคา',
      numberField: 'quotation_number',
    })
  }
  async openCreate() {
    await this.page.getByRole('button', { name: 'สร้างใบเสนอราคา', exact: true }).click()
  }
  async send(number: string) {
    return this.action(number, 'ส่ง', 'send')
  }
  async approve(number: string) {
    return this.action(number, 'อนุมัติ', 'approve')
  }
  async convert(number: string) {
    return this.action(number, 'สร้าง SO', 'convert-to-sales-order')
  }
  async cancel(number: string) {
    return this.action(number, 'ยกเลิก', 'cancel')
  }
}

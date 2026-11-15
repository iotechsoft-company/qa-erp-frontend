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
  async attemptConvert(number: string, id: string) {
    const result = this.page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === `/api/sales-bc/v1/quotations/${id}/convert-to-sales-order` &&
        res.request().method() === 'POST',
    )
    await this.dataTable.row(number).getByRole('button', { name: 'สร้าง SO', exact: true }).click()
    return result
  }
  async convert(number: string) {
    return this.action(number, 'สร้าง SO', 'convert-to-sales-order')
  }
  async cancel(number: string) {
    return this.action(number, 'ยกเลิก', 'cancel')
  }
}

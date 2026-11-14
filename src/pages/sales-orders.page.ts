import { type Page } from '@playwright/test'
import { SalesDocumentListPage } from './sales-document-list.page'
export class SalesOrdersPage extends SalesDocumentListPage {
  constructor(page: Page) {
    super(page, {
      path: '/sales/orders',
      resource: 'sales-orders',
      title: 'ใบสั่งขาย (Sales Orders)',
      placeholder: 'ค้นหาเลขที่ใบสั่งขาย (SO)...',
      empty: 'ไม่พบรายการใบสั่งขาย',
      numberColumn: 'เลขที่ใบสั่งขาย',
      numberField: 'so_number',
    })
  }
  async approve(number: string) {
    return this.action(number, 'อนุมัติ', 'approve')
  }
  async cancel(number: string) {
    return this.action(number, 'ยกเลิก', 'cancel')
  }
}

import { type Page } from '@playwright/test'
import { type CustomerInput } from '@data/factories'
import { PartyListPage } from './party-list.page'

export class CustomersPage extends PartyListPage {
  readonly path = '/customers'
  constructor(page: Page) {
    super(page, {
      entity: 'ลูกค้า',
      title: 'จัดการลูกค้า',
      searchPlaceholder: 'ค้นหาด้วย รหัสลูกค้า, ชื่อลูกค้า, เบอร์โทรศัพท์...',
      endpoint: '/sales-bc/v1/customers',
    })
  }
  get creditLimit() {
    return this.page.getByRole('spinbutton', { name: 'วงเงินเครดิต (THB)' })
  }
  get contactPerson() {
    return this.page.getByRole('textbox', { name: 'ชื่อผู้ติดต่อ', exact: true })
  }
  override async fillForm(input: CustomerInput) {
    await super.fillForm(input)
    await this.contactPerson.fill(input.contact_person ?? '')
    await this.creditLimit.fill(String(input.credit_limit ?? 0))
  }
}

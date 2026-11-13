import { type Page } from '@playwright/test'
import { type SupplierInput } from '@data/factories'
import { PartyListPage } from './party-list.page'

/** /purchasers is the supplier master-data UI, not purchase orders. */
export class PurchasersPage extends PartyListPage {
  readonly path = '/purchasers'
  constructor(page: Page) {
    super(page, {
      entity: 'ผู้จัดส่ง',
      title: 'จัดการผู้จัดส่ง',
      searchPlaceholder: 'ค้นหาด้วย รหัสผู้จัดส่ง, ชื่อผู้จัดส่ง, เบอร์โทรศัพท์, เลขผู้เสียภาษี...',
      endpoint: '/supplier-bc/v1/suppliers',
    })
  }
  get country() {
    return this.page.getByRole('textbox', { name: 'ประเทศ (ISO เช่น TH)' })
  }
  get alias() {
    return this.page.getByRole('textbox', { name: 'ชื่อย่อ', exact: true })
  }
  get currency() {
    return this.page.getByRole('textbox', { name: 'สกุลเงินวางบิล' })
  }
  get paymentTerms() {
    return this.page.getByRole('textbox', { name: 'เงื่อนไขการชำระเงิน', exact: true })
  }
  override async fillForm(input: SupplierInput) {
    await super.fillForm(input)
    await this.country.fill(input.country ?? '')
    await this.alias.fill(input.alias ?? '')
    await this.currency.fill(input.billing_currency ?? '')
    await this.paymentTerms.fill(input.payment_terms_template ?? '')
  }
}

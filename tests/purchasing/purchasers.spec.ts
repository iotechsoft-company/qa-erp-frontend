import { buildSupplier } from '@data/factories'
import { expect, test } from '@fixtures/test'
import { registerPartySuite } from '../helpers/party-suite'

registerPartySuite({
  title: 'Purchasers (suppliers)',
  tag: 'purchasing',
  fixture: 'purchasersPage',
  entity: 'ผู้จัดส่ง',
  typeField: 'supplier_type',
  codeTooLongText: 'รหัสผู้ขายต้องไม่เกิน 50 ตัวอักษร',
  endpoint: '/supplier-bc/v1/suppliers',
  factory: (type) => buildSupplier({ supplier_type: type }),
})

test.describe('Supplier country/currency validation', { tag: ['@purchasing', '@regression'] }, () => {
  test('รหัสประเทศ สกุลเงิน และเงื่อนไขชำระเงินไม่ถูกต้อง', async ({ purchasersPage, page }) => {
    await purchasersPage.goto()
    await purchasersPage.openCreate()
    await purchasersPage.fillForm(buildSupplier())
    await purchasersPage.country.fill('THA')
    await purchasersPage.currency.fill('TH')
    await purchasersPage.paymentTerms.fill('ก'.repeat(151))
    await purchasersPage.save()
    await expect(page.getByText('รหัสประเทศต้องมี 2 ตัวอักษร (เช่น TH)', { exact: true })).toBeVisible()
    await expect(page.getByText('รหัสสกุลเงินต้องมี 3 ตัวอักษร (เช่น THB)', { exact: true })).toBeVisible()
    await expect(page.getByText('เงื่อนไขการชำระเงินต้องไม่เกิน 150 ตัวอักษร', { exact: true })).toBeVisible()
  })
})

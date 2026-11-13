import { buildCustomer } from '@data/factories'
import { expect, test } from '@fixtures/test'
import { registerPartySuite } from '../helpers/party-suite'

registerPartySuite({
  title: 'Customers',
  tag: 'customer',
  fixture: 'customersPage',
  entity: 'ลูกค้า',
  typeField: 'customer_type',
  codeTooLongText: 'รหัสลูกค้าต้องไม่เกิน 50 ตัวอักษร',
  endpoint: '/sales-bc/v1/customers',
  factory: (type) => buildCustomer({ customer_type: type }),
})

test.describe('Customer credit validation', { tag: ['@customer', '@regression'] }, () => {
  test('วงเงินและเงื่อนไขเครดิตติดลบแสดง error ภาษาไทย', async ({ customersPage, page }) => {
    await customersPage.goto()
    await customersPage.openCreate()
    await customersPage.fillForm(buildCustomer({ customer_type: 'company' }))
    await customersPage.creditLimit.fill('-1')
    await customersPage.creditTerms.fill('-1')
    await customersPage.save()
    await expect(page.getByText('วงเงินเครดิตต้องไม่ติดลบ', { exact: true })).toBeVisible()
    await expect(page.getByText('เงื่อนไขเครดิตต้องไม่ติดลบ', { exact: true })).toBeVisible()
  })
})

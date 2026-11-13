import { SalesScenario } from '@api/sales-scenario'
import { expect, test } from '@fixtures/test'
import { expectQuotationTypeBug } from '../helpers/sales-bugs'

test.describe('Sales orders', { tag: ['@sales', '@regression', '@mutation'] }, () => {
  test('quotation ส่ง → อนุมัติ → แปลง SO → อ่าน → ยกเลิก ผ่าน UI', async ({
    allowMutation,
    api,
    quotationsPage,
    salesOrdersPage,
  }) => {
    void allowMutation
    const scenario = new SalesScenario(api)
    try {
      await scenario.seed()
      const quote = await scenario.createQuotation()
      await quotationsPage.goto()
      await quotationsPage.findRecord(quote.quotation_number!)
      await quotationsPage.send(quote.quotation_number!)
      await quotationsPage.goto()
      await quotationsPage.findRecord(quote.quotation_number!)
      await expect(quotationsPage.dataTable.row(quote.quotation_number!)).toContainText('ส่งให้ลูกค้าแล้ว')
      await quotationsPage.approve(quote.quotation_number!)
      await quotationsPage.goto()
      await quotationsPage.findRecord(quote.quotation_number!)
      await expect(quotationsPage.dataTable.row(quote.quotation_number!)).toContainText('ลูกค้าอนุมัติแล้ว')
      const converted = await quotationsPage.convert(quote.quotation_number!)
      const number = converted.data.attributes.so_number as string
      await salesOrdersPage.goto()
      await salesOrdersPage.findRecord(number)
      await expect(salesOrdersPage.dataTable.row(number)).toBeVisible()
      await salesOrdersPage.openDetails(number)
      await expect(salesOrdersPage.details).toContainText(scenario.customer.name_th)
      await salesOrdersPage.closeDetails()
      await salesOrdersPage.cancel(number)
      await salesOrdersPage.goto()
      await salesOrdersPage.findRecord(number)
      await expect(salesOrdersPage.dataTable.row(number)).toContainText('ยกเลิกแล้ว')
      const order = await api.get<{ data: { attributes: { status: string } } }>(
        `/sales-bc/v1/sales-orders/${converted.data.id}`,
      )
      expect(order.data.attributes.status).toBe('CANCELLED')
    } finally {
      await scenario.cleanup()
    }
  })

  test(
    'known bug #3: โหมด SO ส่ง document_type ตัวพิมพ์เล็กและถูก reject',
    { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/3' } },
    async ({ allowMutation, api, salesCreatePage }) => {
      void allowMutation
      const scenario = new SalesScenario(api)
      try {
        await scenario.seed()
        await salesCreatePage.goto()
        await salesCreatePage.selectMode('order')
        await salesCreatePage.selectCustomer(scenario.customer.code)
        await salesCreatePage.addProduct(scenario.sku)
        await salesCreatePage.setLine(scenario.sku, 'ราคาขาย/หน่วย', '100')
        await salesCreatePage.remark.fill(scenario.quotationInput().remark_th)
        await expectQuotationTypeBug(await salesCreatePage.submit('order'))
      } finally {
        await scenario.cleanup()
      }
    },
  )
})

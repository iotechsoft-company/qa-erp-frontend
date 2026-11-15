import { SalesScenario } from '@api/sales-scenario'
import { expect, test } from '@fixtures/test'
import { OwnedSalesScenario } from '../helpers/owned-sales'

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
    'UI create SO completes the approved-QT conversion chain (#3 regression)',
    { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/3' } },
    async ({ allowMutation, api, salesCreatePage }) => {
      void allowMutation
      const scenario = new OwnedSalesScenario(api)
      try {
        await scenario.seed()
        await salesCreatePage.goto()
        await salesCreatePage.selectMode('order')
        await salesCreatePage.selectCustomer(scenario.customer.code)
        await salesCreatePage.addProduct(scenario.sku)
        await salesCreatePage.setLine(scenario.sku, 'ราคาขาย/หน่วย', '100')
        await salesCreatePage.remark.fill(scenario.quotationInput().remark_th)
        const response = await salesCreatePage.create('order')
        const json = await response.json()
        expect(json.data.attributes).toMatchObject({ status: 'CONFIRMED', customer_id: scenario.customerId })
        const order = await api.get<{ data: { attributes: { quotation_id: string; status: string } } }>(
          `/sales-bc/v1/sales-orders/${json.data.id}`,
        )
        expect(order.data.attributes.status).toBe('CONFIRMED')
        const quote = await api.get<{
          data: { attributes: { document_type: string; status: string; sales_order_id: string } }
        }>(`/sales-bc/v1/quotations/${order.data.attributes.quotation_id}`)
        expect(quote.data.attributes).toMatchObject({
          document_type: 'STANDARD_QUOTATION',
          status: 'APPROVED',
          sales_order_id: json.data.id,
        })
        expect(await scenario.inventory.stockQty()).toBe(1)
      } finally {
        await scenario.cleanup()
      }
    },
  )
})

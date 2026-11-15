import { SalesScenario } from '@api/sales-scenario'
import { expect, test } from '@fixtures/test'
import { OwnedSalesStock } from '@api/owned-sales-stock'

test.describe('Quotations', { tag: ['@sales', '@regression', '@mutation'] }, () => {
  test(
    'UI create QT uses uppercase document type and persists a draft (#3 regression)',
    { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/3' } },
    async ({ allowMutation, api, salesCreatePage }) => {
      void allowMutation
      const stock = new OwnedSalesStock(api)
      const scenario = new SalesScenario(api, stock)
      try {
        await scenario.seed()
        await salesCreatePage.goto()
        await salesCreatePage.selectMode('quotation')
        await salesCreatePage.selectCustomer(scenario.customer.code)
        await salesCreatePage.addProduct(scenario.sku)
        await salesCreatePage.setLine(scenario.sku, 'ราคาขาย/หน่วย', '100')
        await salesCreatePage.remark.fill(scenario.quotationInput().remark_th)
        const response = await salesCreatePage.create('quotation')
        expect(response.request().postDataJSON().document_type).toBe('STANDARD_QUOTATION')
        const json = await response.json()
        expect(json.data.attributes).toMatchObject({
          status: 'DRAFT',
          customer_id: scenario.customerId,
          document_type: 'STANDARD_QUOTATION',
        })
        const read = await api.get<{ data: { id: string; attributes: { status: string } } }>(
          `/sales-bc/v1/quotations/${json.data.id}`,
        )
        expect(read.data).toMatchObject({ id: json.data.id, attributes: { status: 'DRAFT' } })
        await stock.expectUnchanged()
      } finally {
        await scenario.cleanup()
      }
    },
  )

  test(`validation quotation: ลูกค้าและวันที่เป็นภาษาไทย`, async ({ allowMutation, api, salesCreatePage }) => {
    void allowMutation
    const scenario = new SalesScenario(api)
    try {
      await scenario.seed()
      await salesCreatePage.goto()
      await salesCreatePage.selectMode('quotation')
      await salesCreatePage.addProduct(scenario.sku)
      await salesCreatePage.save('quotation')
      await expect(salesCreatePage.alert).toContainText('กรุณาเลือกลูกค้าก่อนทำรายการ')
      await salesCreatePage.selectCustomer(scenario.customer.code)
      await salesCreatePage.documentDate.fill('')
      await salesCreatePage.save('quotation')
      await expect(salesCreatePage.alert).toContainText('กรุณาระบุวันที่เอกสาร')
      await salesCreatePage.documentDate.fill(scenario.quotationInput().document_date!.slice(0, 10))
      await salesCreatePage.validUntil.fill('')
      await salesCreatePage.save('quotation')
      await expect(salesCreatePage.alert).toContainText('กรุณาระบุวันหมดอายุใบเสนอราคา')
      await expect(salesCreatePage.validUntil).toBeVisible()
    } finally {
      await scenario.cleanup()
    }
  })

  test(`validation order: ลูกค้าและวันที่เป็นภาษาไทย`, async ({ allowMutation, api, salesCreatePage }) => {
    void allowMutation
    const scenario = new SalesScenario(api)
    try {
      await scenario.seed()
      await salesCreatePage.goto()
      await salesCreatePage.selectMode('order')
      await salesCreatePage.addProduct(scenario.sku)
      await salesCreatePage.save('order')
      await expect(salesCreatePage.alert).toContainText('กรุณาเลือกลูกค้าก่อนทำรายการ')
      await salesCreatePage.selectCustomer(scenario.customer.code)
      await salesCreatePage.documentDate.fill('')
      await salesCreatePage.save('order')
      await expect(salesCreatePage.alert).toContainText('กรุณาระบุวันที่เอกสาร')
      await salesCreatePage.documentDate.fill(scenario.quotationInput().document_date!.slice(0, 10))
    } finally {
      await scenario.cleanup()
    }
  })

  test(`validation delivery: ลูกค้าและวันที่เป็นภาษาไทย`, async ({ allowMutation, api, salesCreatePage }) => {
    void allowMutation
    const scenario = new SalesScenario(api)
    try {
      await scenario.seed()
      await salesCreatePage.goto()
      await salesCreatePage.selectMode('delivery')
      await salesCreatePage.selectWarehouse(scenario.warehouseName)
      await salesCreatePage.addProduct(scenario.sku)
      await salesCreatePage.save('delivery')
      await expect(salesCreatePage.alert).toContainText('กรุณาเลือกลูกค้าก่อนทำรายการ')
      await salesCreatePage.selectCustomer(scenario.customer.code)
      await salesCreatePage.documentDate.fill('')
      await salesCreatePage.save('delivery')
      await expect(salesCreatePage.alert).toContainText('กรุณาระบุวันที่เอกสาร')
      await salesCreatePage.documentDate.fill(scenario.quotationInput().document_date!.slice(0, 10))
    } finally {
      await scenario.cleanup()
    }
  })

  test(
    'known bug #5: QT draft ยังไม่มีปุ่มแก้ไขและลบ',
    { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/5' } },
    async ({ allowMutation, api, quotationsPage }) => {
      void allowMutation
      const scenario = new SalesScenario(api)
      try {
        await scenario.seed()
        const quote = await scenario.createQuotation()
        await quotationsPage.goto()
        await quotationsPage.findRecord(quote.quotation_number!)
        await expect(quotationsPage.dataTable.row(quote.quotation_number!)).toContainText('ฉบับร่าง')
        await quotationsPage.openDetails(quote.quotation_number!)
        await expect(quotationsPage.details).toContainText(scenario.customer.name_th)
        await expect(quotationsPage.details.getByRole('button', { name: 'แก้ไข', exact: true })).toHaveCount(0)
        await expect(quotationsPage.details.getByRole('button', { name: 'ลบ', exact: true })).toHaveCount(0)
        await quotationsPage.closeDetails()
        await expect(
          quotationsPage.dataTable.row(quote.quotation_number!).getByRole('button', { name: 'แก้ไข', exact: true }),
        ).toHaveCount(0)
        await expect(
          quotationsPage.dataTable.row(quote.quotation_number!).getByRole('button', { name: 'ลบ', exact: true }),
        ).toHaveCount(0)
      } finally {
        await scenario.cleanup()
      }
    },
  )

  test('อ่านรายละเอียดร่างใบเสนอราคา', async ({ allowMutation, api, quotationsPage }) => {
    void allowMutation
    const scenario = new SalesScenario(api)
    try {
      await scenario.seed()
      const quote = await scenario.createQuotation()
      await quotationsPage.goto()
      await quotationsPage.findRecord(quote.quotation_number!)
      await quotationsPage.openDetails(quote.quotation_number!)
      await expect(quotationsPage.details).toContainText(scenario.customer.name_th)
      await quotationsPage.closeDetails()
    } finally {
      await scenario.cleanup()
    }
  })
})

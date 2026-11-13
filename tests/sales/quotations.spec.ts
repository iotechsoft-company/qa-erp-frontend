import { SalesScenario } from '@api/sales-scenario'
import { expect, test } from '@fixtures/test'

test.describe('Quotations', { tag: ['@sales', '@regression', '@mutation'] }, () => {
  test(
    'สร้างใบเสนอราคาผ่าน UI และอ่านรายละเอียดใน list',
    { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/3' } },
    async ({ allowMutation, api, salesCreatePage, quotationsPage }) => {
      void allowMutation
      test.fail(true, 'quotation document_type case mismatch')
      const scenario = new SalesScenario(api)
      try {
        await scenario.seed()
        await salesCreatePage.goto()
        await salesCreatePage.selectMode('quotation')
        await salesCreatePage.selectCustomer(scenario.customer.code)
        await salesCreatePage.addProduct(scenario.sku)
        await salesCreatePage.setLine(scenario.sku, 'ราคาขาย/หน่วย', '100')
        await salesCreatePage.remark.fill(scenario.quotationInput().remark_th)
        const quote = await salesCreatePage.submitQuotation()
        await quotationsPage.goto()
        await quotationsPage.findRecord(quote.number)
        await expect(quotationsPage.dataTable.row(quote.number)).toContainText('ฉบับร่าง')
        await quotationsPage.openDetails(quote.number)
        await expect(quotationsPage.details).toContainText(scenario.customer.name_th)
        await quotationsPage.closeDetails()
        const actual = await api.get<{ data: { attributes: { status: string } } }>(
          `/sales-bc/v1/quotations/${quote.id}`,
        )
        expect(actual.data.attributes.status).toBe('DRAFT')
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
    'ร่างใบเสนอราคามีปุ่มแก้ไขและลบ',
    { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/5' } },
    async ({ allowMutation, api, quotationsPage }) => {
      void allowMutation
      test.fail(true, 'erp-frontend#5 — draft edit/delete UI is missing')
      const scenario = new SalesScenario(api)
      try {
        await scenario.seed()
        const quote = await scenario.createQuotation()
        await quotationsPage.goto()
        await quotationsPage.findRecord(quote.quotation_number!)
        await expect(
          quotationsPage.dataTable.row(quote.quotation_number!).getByRole('button', { name: 'แก้ไข', exact: true }),
        ).toBeVisible()
        await expect(
          quotationsPage.dataTable.row(quote.quotation_number!).getByRole('button', { name: 'ลบ', exact: true }),
        ).toBeVisible()
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

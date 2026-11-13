import { SalesScenario } from '@api/sales-scenario'
import { expect, test } from '@fixtures/test'
import { expectQuotationTypeBug } from '../helpers/sales-bugs'

test.describe('Quotations', { tag: ['@sales', '@regression', '@mutation'] }, () => {
  test(
    'known bug #3: สร้าง QT ถูก reject เพราะ document_type ตัวพิมพ์เล็ก',
    { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/3' } },
    async ({ allowMutation, api, salesCreatePage }) => {
      void allowMutation
      const scenario = new SalesScenario(api)
      try {
        await scenario.seed()
        await salesCreatePage.goto()
        await salesCreatePage.selectMode('quotation')
        await salesCreatePage.selectCustomer(scenario.customer.code)
        await salesCreatePage.addProduct(scenario.sku)
        await salesCreatePage.setLine(scenario.sku, 'ราคาขาย/หน่วย', '100')
        await salesCreatePage.remark.fill(scenario.quotationInput().remark_th)
        await expectQuotationTypeBug(await salesCreatePage.submit('quotation'))
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

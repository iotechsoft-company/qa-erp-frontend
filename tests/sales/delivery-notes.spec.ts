import { SalesScenario } from '@api/sales-scenario'
import { expect, test } from '@fixtures/test'
import { OwnedSalesStock } from '@api/owned-sales-stock'

test.describe('Delivery notes', { tag: ['@sales', '@regression', '@mutation'] }, () => {
  test('อ่านร่างและ validate เหตุผลยกเลิก ก่อนยกเลิกผ่าน UI', async ({ allowMutation, api, deliveryNotesPage }) => {
    void allowMutation
    const scenario = new SalesScenario(api)
    try {
      await scenario.seed()
      const order = await scenario.createOrder()
      const note = await api.create<{ dn_number: string }>('/sales-bc/v1/delivery-notes', scenario.deliveryInput(order))
      await deliveryNotesPage.goto()
      await deliveryNotesPage.filterStatus('ฉบับร่าง', 'DRAFT')
      await deliveryNotesPage.findRecord(note.dn_number)
      await deliveryNotesPage.openDetails(note.dn_number)
      await expect(deliveryNotesPage.details).toContainText(scenario.customer.name_th)
      await deliveryNotesPage.closeDetails()
      await deliveryNotesPage.openCancel(note.dn_number)
      await expect(deliveryNotesPage.confirmCancel).toBeDisabled()
      await deliveryNotesPage.cancelReason.fill('   ')
      await expect(deliveryNotesPage.confirmCancel).toBeDisabled()
      await deliveryNotesPage.closeDetails()
      await deliveryNotesPage.cancel(note.dn_number, `${scenario.marker} เลื่อนกำหนดจัดส่ง`)
      await deliveryNotesPage.goto()
      await deliveryNotesPage.filterStatus('ยกเลิกแล้ว', 'CANCELLED')
      await deliveryNotesPage.findRecord(note.dn_number)
      await expect(deliveryNotesPage.dataTable.row(note.dn_number)).toContainText('ยกเลิกแล้ว')
      await expect(
        deliveryNotesPage.dataTable.row(note.dn_number).getByRole('button', { name: 'ยกเลิก', exact: true }),
      ).toBeDisabled()
    } finally {
      await scenario.cleanup()
    }
  })

  test(
    'UI create draft DN maps real SO and SO-item IDs (#4 regression)',
    { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/4' } },
    async ({ allowMutation, api, salesCreatePage }) => {
      void allowMutation
      const stock = new OwnedSalesStock(api)
      const scenario = new SalesScenario(api, stock)
      try {
        await scenario.seed()
        await salesCreatePage.goto()
        await salesCreatePage.selectMode('delivery')
        await salesCreatePage.selectCustomer(scenario.customer.code)
        await salesCreatePage.selectWarehouse(scenario.warehouseName)
        await salesCreatePage.addProduct(scenario.sku)
        await salesCreatePage.remark.fill(`${scenario.marker} จัดส่งสินค้าสำนักงาน`)
        const response = await salesCreatePage.create('delivery')
        const payload = response.request().postDataJSON()
        const json = await response.json()
        expect(json.data.attributes).toMatchObject({ status: 'DRAFT', so_id: payload.so_id })
        expect(payload.so_id).not.toBe(scenario.customerId)
        expect(payload.items).toHaveLength(1)
        expect(payload.items[0].so_item_id).not.toBe(scenario.productId)
        const order = await api.get<{
          data: {
            id: string
            attributes: {
              status: string
              customer_id: string
              quotation_id: string
              remark: { th: string }
              items: { id: string; product_id: string }[]
            }
          }
        }>(`/sales-bc/v1/sales-orders/${payload.so_id}`, { relations: 'items' })
        expect(order.data.attributes).toMatchObject({
          status: 'CONFIRMED',
          customer_id: scenario.customerId,
          remark: { th: expect.stringMatching(new RegExp(`^${scenario.marker}`)) },
        })
        const quotation = await api.get<{ data: { attributes: { remark: { th: string } } } }>(
          `/sales-bc/v1/quotations/${order.data.attributes.quotation_id}`,
        )
        expect(quotation.data.attributes.remark.th).toMatch(new RegExp(`^${scenario.marker}`))
        expect(json.data.attributes.remark.th).toMatch(new RegExp(`^${scenario.marker}`))
        expect(order.data.attributes.items).toEqual([
          expect.objectContaining({ id: payload.items[0].so_item_id, product_id: scenario.productId }),
        ])
        const read = await api.get<{ data: { attributes: { status: string; so_id: string } } }>(
          `/sales-bc/v1/delivery-notes/${json.data.id}`,
        )
        expect(read.data.attributes).toMatchObject({ status: 'DRAFT', so_id: order.data.id })
        await stock.expectUnchanged()
      } finally {
        await scenario.cleanup()
      }
    },
  )

  test(
    'known bug #5: DN draft ยังไม่มีปุ่มแก้ไขและลบ',
    { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/5' } },
    async ({ allowMutation, api, deliveryNotesPage }) => {
      void allowMutation
      const scenario = new SalesScenario(api)
      try {
        await scenario.seed()
        const order = await scenario.createOrder()
        const note = await api.create<{ dn_number: string }>(
          '/sales-bc/v1/delivery-notes',
          scenario.deliveryInput(order),
        )
        await deliveryNotesPage.goto()
        await deliveryNotesPage.filterStatus('ฉบับร่าง', 'DRAFT')
        await deliveryNotesPage.findRecord(note.dn_number)
        await expect(deliveryNotesPage.dataTable.row(note.dn_number)).toContainText('ฉบับร่าง')
        await deliveryNotesPage.openDetails(note.dn_number)
        await expect(deliveryNotesPage.details).toContainText(scenario.customer.name_th)
        await expect(deliveryNotesPage.details.getByRole('button', { name: 'แก้ไข', exact: true })).toHaveCount(0)
        await expect(deliveryNotesPage.details.getByRole('button', { name: 'ลบ', exact: true })).toHaveCount(0)
        await deliveryNotesPage.closeDetails()
        await expect(
          deliveryNotesPage.dataTable.row(note.dn_number).getByRole('button', { name: 'แก้ไข', exact: true }),
        ).toHaveCount(0)
        await expect(
          deliveryNotesPage.dataTable.row(note.dn_number).getByRole('button', { name: 'ลบ', exact: true }),
        ).toHaveCount(0)
      } finally {
        await scenario.cleanup()
      }
    },
  )
})

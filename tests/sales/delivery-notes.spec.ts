import { SalesScenario } from '@api/sales-scenario'
import { expect, test } from '@fixtures/test'

test.describe('Delivery notes', { tag: ['@sales', '@regression', '@mutation'] }, () => {
  test('อ่านร่างและ validate เหตุผลยกเลิก ก่อนยกเลิกผ่าน UI', async ({ allowMutation, api, deliveryNotesPage }) => {
    void allowMutation
    const scenario = new SalesScenario(api)
    try {
      await scenario.seed()
      const order = await scenario.createOrder()
      const note = await api.create<{ dn_number: string }>('/sales-bc/v1/delivery-notes', scenario.deliveryInput(order))
      await deliveryNotesPage.goto()
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
    'known bug #4: DN ส่ง customer/product IDs แล้วหา SO ไม่พบ',
    { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/4' } },
    async ({ allowMutation, api, salesCreatePage }) => {
      void allowMutation
      const scenario = new SalesScenario(api)
      try {
        await scenario.seed()
        const order = await scenario.createOrder()
        await salesCreatePage.goto()
        await salesCreatePage.selectMode('delivery')
        await salesCreatePage.selectCustomer(scenario.customer.code)
        await salesCreatePage.selectWarehouse(scenario.warehouseName)
        await salesCreatePage.addProduct(scenario.sku)
        await salesCreatePage.remark.fill(`${scenario.marker} จัดส่งสินค้าสำนักงาน`)
        const response = await salesCreatePage.submit('delivery')
        expect(response.request().postDataJSON()).toMatchObject({
          so_id: scenario.customerId,
          items: [{ so_item_id: scenario.productId, qty: 1 }],
        })
        expect(scenario.customerId).not.toBe(order.id)
        expect(scenario.productId).not.toBe(order.items![0]!.id)
        expect(response.status()).toBe(404)
        const body = await response.json()
        expect(body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'NOT_FOUND' })]))
        expect(body.status.message).toContain(scenario.customerId)
        expect(body.status.message).toMatch(/sales.orders.*not found/i)
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

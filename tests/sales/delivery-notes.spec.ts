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
    'โหมดสร้าง DN ส่ง so_id และ so_item_id จากใบสั่งขาย',
    { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/4' } },
    async ({ allowMutation, api, salesCreatePage, page }) => {
      void allowMutation
      test.fail(true, 'customer/product IDs used instead of sales-order references')
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
        const result = page.waitForResponse(
          (res) =>
            new URL(res.url()).pathname === '/api/sales-bc/v1/delivery-notes' && res.request().method() === 'POST',
        )
        await salesCreatePage.save('delivery')
        const response = await result
        expect(response.request().postDataJSON()).toMatchObject({
          so_id: order.id,
          items: [{ so_item_id: order.items![0]!.id, qty: 1 }],
        })
        expect(response.status()).toBe(201)
      } finally {
        await scenario.cleanup()
      }
    },
  )

  test(
    'ร่างใบส่งสินค้ามีปุ่มแก้ไขและลบ',
    { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/5' } },
    async ({ allowMutation, api, deliveryNotesPage }) => {
      void allowMutation
      test.fail(true, 'erp-frontend#5 — draft edit/delete UI is missing')
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
        await expect(
          deliveryNotesPage.dataTable.row(note.dn_number).getByRole('button', { name: 'แก้ไข', exact: true }),
        ).toBeVisible()
        await expect(
          deliveryNotesPage.dataTable.row(note.dn_number).getByRole('button', { name: 'ลบ', exact: true }),
        ).toBeVisible()
      } finally {
        await scenario.cleanup()
      }
    },
  )
})

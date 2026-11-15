import { SalesFulfillmentScenario } from '@api/sales-fulfillment-scenario'
import { expect, test } from '@fixtures/test'

test.describe('Owned Sales stock factory contracts', { tag: ['@sales', '@api', '@regression', '@mutation'] }, () => {
  test('GR expiry/cost/quantity and quotation line discount persist through conversion', async ({
    allowMutation,
    api,
  }) => {
    void allowMutation
    const expiryDate = new Date(Date.now() + 30 * 86_400_000).toISOString()
    const s = new SalesFulfillmentScenario(api, [{ qty: 2, unitCost: 80, expiryDate }])
    try {
      await s.seed()
      expect(await s.lots()).toEqual([
        expect.objectContaining({
          id: s.stock.lots[0]!.id,
          available_qty: 2,
          received_qty: 2,
          import_cost: 80,
        }),
      ])
      expect(new Date((await s.lots())[0]!.expiry_date!).toISOString()).toBe(expiryDate)
      const order = await s.newOrder(2, 150, 30)
      expect(order).toMatchObject({
        status: 'CONFIRMED',
        total: 288.9,
        items: [expect.objectContaining({ qty: 2, unit_price: 150, line_total: 270 })],
      })
      const quote = await api.get<{
        data: { attributes: { discount_mode: string; total_discount: number; total: number } }
      }>(`/sales-bc/v1/quotations/${order.quotation_id}`)
      expect(quote.data.attributes).toMatchObject({ discount_mode: 'per_item', total_discount: 30, total: order.total })
      await s.stock.expectUnchanged()
    } finally {
      await s.cleanup()
    }
  })
})

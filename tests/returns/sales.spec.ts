import { ReturnScenario } from '@api/return-scenario'
import { expect, test } from '@fixtures/test'
import { quantities, ledger, cogs } from './support'

test.describe(
  'B4 customer returns (API path; frontend has no receive-return UI)',
  { tag: ['@returns', '@sales', '@regression', '@mutation'] },
  () => {
    test('partial return credits original lot/cost, returned qty and COGS/GL; cancellation restores the sale', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new ReturnScenario(api, 'sales')
      try {
        await s.seed()
        await cogs(s, 4, 160, 2)
        const before = await s.snapshot()
        const draft = await s.create(2)
        expect(await s.snapshot()).toEqual(before)
        const submitted = await s.action(draft.id, 'submit')
        expect(submitted).toMatchObject({
          status: 'SUBMITTED',
          so_id: s.orderId,
          warehouse_id: s.warehouseId,
          items: [
            expect.objectContaining({
              dn_item_id: s.source.items[0]!.id,
              product_id: s.productId,
              qty: 2,
              unit_price: 150,
              line_total: 300,
            }),
          ],
        })
        await quantities(s, 2, 2, 'PARTIAL')
        await ledger(s, draft.items[0]!.id, s.fulfillment!.stock.lots[0]!.id, 2, 40, 'SALES_RETURN')
        await cogs(s, 2, 80, 4)
        await s.action(draft.id, 'cancel')
        await quantities(s, 0, 0, 'CLOSED')
        await cogs(s, 4, 160, 6)
      } finally {
        await s.cleanup()
      }
    })
  },
)

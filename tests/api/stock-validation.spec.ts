import { StockScenario } from '@api/stock-scenario'
import { expect, test } from '@fixtures/test'

test.describe('Stock DTO validation', { tag: ['@stock', '@api', '@inventory', '@regression', '@mutation'] }, () => {
  for (const resource of ['stock-entries', 'stock-adjustments'] as const) {
    test(`${resource}: invalid qty rejected without stock effects`, async ({ allowMutation, api }) => {
      void allowMutation
      const s = new StockScenario(api)
      try {
        await s.seed()
        const receipt = await s.receipt()
        const before = await s.snapshot()
        const inputs = {
          'stock-entries': { ...s.issueInput(), items: [{ product_id: s.productId, qty: 0 }] },
          'stock-adjustments': { ...s.adjustmentInput(receipt.items[0]!.target_lot_id!, -1) },
        }
        const expected = {
          'stock-entries': {
            detail: 'qty must be a positive number',
            source: { pointer: '/data/attributes/items.0.qty' },
          },
          'stock-adjustments': {
            detail: 'counted_qty must not be less than 0',
            source: { pointer: '/data/attributes/items.0.counted_qty' },
          },
        }
        const response = await api.postResponse(`/inventory-bc/v1/${resource}`, inputs[resource])
        expect(response.status()).toBe(400)
        expect(await response.json()).toMatchObject({
          status: { code: 400001 },
          errors: [{ code: 'VALIDATION_ERROR', ...expected[resource] }],
        })
        expect(await s.snapshot()).toEqual(before)
      } finally {
        await s.cleanup()
      }
    })
  }
})

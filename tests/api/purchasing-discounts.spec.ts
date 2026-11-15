import { PurchasingScenario } from '@api/purchasing-scenario'
import { expect, test } from '@fixtures/test'

for (const mode of ['none', 'header', 'per_item', 'both'] as const) {
  // Deliberately send both sets of fields. The selected mode determines which apply.
  const lineDiscount = ['per_item', 'both'].includes(mode) ? 5 * 80 * 0.125 : 0
  const headerDiscount = ['header', 'both'].includes(mode) ? 25 : 0

  test(
    `PO factory discount ${mode}: percent line / amount header and ignored fields`,
    { tag: ['@purchasing', '@api', '@regression', '@mutation'] },
    async ({ allowMutation, api }) => {
      void allowMutation
      const s = new PurchasingScenario(api)
      try {
        await s.seed()
        const created = await s.createOrder(false, {
          discount_mode: mode,
          discount_type: 'amount',
          discount_value: 25,
          items: [{ product_id: s.productId, qty: 5, unit_cost: 80, discount_type: 'percent', discount: 12.5 }],
        })
        const actual = await s.readOrder(created.id)
        expect(actual).toMatchObject({
          status: 'DRAFT',
          discount_mode: mode,
          sub_total: 5 * 80,
          total_discount: lineDiscount + headerDiscount,
          total: 5 * 80 - lineDiscount - headerDiscount,
        })
        expect(actual.items).toEqual([
          expect.objectContaining({
            product_id: s.productId,
            qty: 5,
            line_total: 5 * 80 - lineDiscount,
            received_qty: 0,
          }),
        ])
        expect(await s.stockQty()).toBe(0)
      } finally {
        await s.cleanup()
      }
    },
  )
}

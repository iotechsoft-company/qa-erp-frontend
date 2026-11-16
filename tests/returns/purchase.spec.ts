import { ReturnScenario } from '@api/return-scenario'
import { expect, test } from '@fixtures/test'
import { quantities, ledger, rejection } from './support'

test.describe('A4 supplier returns', { tag: ['@returns', '@purchasing', '@regression', '@mutation'] }, () => {
  test('API partial/full return follows original lot/cost, PO net status and symmetric reversal', async ({
    allowMutation,
    api,
  }) => {
    void allowMutation
    const s = new ReturnScenario(api, 'purchase')
    try {
      await s.seed()
      const lot = s.source.items[0]!.lot_id!
      const before = await s.snapshot()
      const first = await s.create(1)
      expect(await s.snapshot()).toEqual(before)
      const posted = await s.action(first.id, 'submit')
      expect(posted).toMatchObject({
        status: 'SUBMITTED',
        po_id: s.orderId,
        warehouse_id: s.warehouseId,
        items: [
          expect.objectContaining({
            grn_item_id: s.source.items[0]!.id,
            lot_id: lot,
            qty_entered: 1,
            conversion_factor: 1,
            qty: 1,
            unit_cost: 40,
            line_total: 40,
          }),
        ],
      })
      expect(posted.po_synced_at).toEqual(expect.any(String))
      await quantities(s, 3, 1, 'PARTIAL')
      await ledger(s, first.id, lot, -1, 40, 'RETURN')
      await s.action(first.id, 'sync-purchase-order')
      await quantities(s, 3, 1, 'PARTIAL')
      const second = await s.create(3)
      await s.action(second.id, 'submit')
      await quantities(s, 0, 4, 'SENT')
      const after = await s.snapshot()
      await rejection(
        await api.postResponse(`${s.path}/${second.id}/submit`, {}),
        409,
        `Purchase return '${second.id}' cannot move from SUBMITTED to SUBMITTED.`,
      )
      expect(await s.snapshot()).toEqual(after)
      await s.action(second.id, 'cancel')
      await quantities(s, 3, 1, 'PARTIAL')
      await s.action(first.id, 'cancel')
      await quantities(s, 4, 0, 'RECEIVED')
      await ledger(s, first.id, lot, 1, 40, 'RETURN')
    } finally {
      await s.cleanup()
    }
  })

  test('UI create/submit → returns history/details; zero quantity disables submit', async ({
    allowMutation,
    api,
    purchaseReturnsPage,
  }) => {
    void allowMutation
    const s = new ReturnScenario(api, 'purchase')
    try {
      await s.seed()
      await purchaseReturnsPage.goto()
      await purchaseReturnsPage.open(s.source.grn_number!)
      await purchaseReturnsPage.qty(s.inventory.sku, 0)
      await expect(purchaseReturnsPage.confirm).toBeDisabled()
      const created = await purchaseReturnsPage.create(s.inventory.sku, 1, s.input().return_reason)
      expect(created.data.attributes.status).toBe('SUBMITTED')
      const record = await s.read(created.data.id)
      expect(record.grn_id).toBe(s.source.id)
      expect(record.return_reason).toBe(s.input().return_reason)
      await quantities(s, 3, 1, 'PARTIAL')
      await purchaseReturnsPage.history()
      await purchaseReturnsPage.search(record.prn_number!)
      await purchaseReturnsPage.view(record.prn_number!)
      await expect(purchaseReturnsPage.details).toContainText(s.input().return_reason)
    } finally {
      await s.cleanup()
    }
  })
})

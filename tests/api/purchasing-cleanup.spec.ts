import { purchasingCleanupAction } from '@data/purchasing-cleanup'
import { expect, test } from '@fixtures/test'

test.describe('Purchasing cleanup guards', { tag: ['@purchasing', '@api', '@regression'] }, () => {
  test('drafts delete; submitted GR reverses; terminal states retain', () => {
    expect(purchasingCleanupAction('goods-receipts', { status: 'DRAFT' })).toBe('delete')
    expect(purchasingCleanupAction('goods-receipts', { status: 'SUBMITTED' })).toBe('cancel')
    expect(purchasingCleanupAction('goods-receipts', { status: 'CANCELLED' })).toBe('retain')
    expect(purchasingCleanupAction('purchase-orders', { status: 'RECEIVED' })).toBe('retain')
  })

  test('PO holding stock cannot cancel; reversed receipt allows SENT cancellation', () => {
    expect(
      purchasingCleanupAction('purchase-orders', { status: 'PARTIAL', items: [{ received_qty: 1, returned_qty: 0 }] }),
    ).toBe('retain')
    expect(
      purchasingCleanupAction('purchase-orders', { status: 'SENT', items: [{ received_qty: 0, returned_qty: 0 }] }),
    ).toBe('cancel')
  })
})

test(
  'cleanup after an interrupted submitted GR waits for PO/stock reversal and removes owned masters',
  { tag: ['@purchasing', '@api', '@regression', '@mutation'] },
  async ({ allowMutation, api }) => {
    void allowMutation
    const { PurchasingScenario } = await import('@api/purchasing-scenario')
    const s = new PurchasingScenario(api)
    try {
      await s.seed()
      const receipt = await s.createReceipt()
      await api.post(`/inventory-bc/v1/goods-receipts/${receipt.id}/submit`, {})
      await expect.poll(() => s.stockQty()).toBe(1)
      await s.cleanup()
      expect(await s.stockQty()).toBe(0)
      expect(await s.orderStatus(receipt.po_id!)).toBe('CANCELLED')
      expect(await api.list('/inventory-bc/v1/products', { filter: `sku||$eq||${s.sku}` })).toEqual([])
      expect(await api.list('/supplier-bc/v1/suppliers', { filter: `code||$eq||${s.supplier.code}` })).toEqual([])
      expect(
        (await api.get<{ data: { attributes: { status: string } } }>(`/inventory-bc/v1/goods-receipts/${receipt.id}`))
          .data.attributes.status,
      ).toBe('CANCELLED')
    } finally {
      await s.cleanup()
    }
  },
)

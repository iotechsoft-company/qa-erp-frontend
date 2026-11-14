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

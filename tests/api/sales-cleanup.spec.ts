import { salesCleanupAction } from '@data/sales-cleanup'
import { expect, test } from '@fixtures/test'

test.describe('Sales cleanup cancellation guards', { tag: ['@sales', '@api', '@regression'] }, () => {
  test('converted and expired quotations are retained; released approved quotation can be cancelled', () => {
    expect(salesCleanupAction('quotations', { status: 'APPROVED', sales_order_id: 'linked-order' })).toBe('retain')
    expect(salesCleanupAction('quotations', { status: 'APPROVED', sales_order_id: null })).toBe('cancel')
    expect(salesCleanupAction('quotations', { status: 'EXPIRED' })).toBe('retain')
    expect(salesCleanupAction('quotations', { status: 'DRAFT' })).toBe('delete')
  })

  test('delivered or terminal orders are retained; open orders can be cancelled', () => {
    expect(salesCleanupAction('sales-orders', { status: 'CONFIRMED', items: [{ delivered_qty: 1 }] })).toBe('retain')
    expect(salesCleanupAction('sales-orders', { status: 'PARTIAL' })).toBe('retain')
    expect(salesCleanupAction('sales-orders', { status: 'CLOSED' })).toBe('retain')
    expect(salesCleanupAction('sales-orders', { status: 'CONFIRMED' })).toBe('cancel')
    expect(salesCleanupAction('sales-orders', { status: 'PENDING_APPROVAL' })).toBe('cancel')
  })

  test('DN cancellation follows DRAFT/PENDING_APPROVAL/SUBMITTED transitions only', () => {
    expect(salesCleanupAction('delivery-notes', { status: 'DRAFT' })).toBe('delete')
    expect(salesCleanupAction('delivery-notes', { status: 'PENDING_APPROVAL' })).toBe('cancel')
    expect(salesCleanupAction('delivery-notes', { status: 'SUBMITTED' })).toBe('cancel')
    expect(salesCleanupAction('delivery-notes', { status: 'DELIVERED' })).toBe('retain')
    expect(salesCleanupAction('delivery-notes', { status: 'CANCELLED' })).toBe('retain')
  })
})

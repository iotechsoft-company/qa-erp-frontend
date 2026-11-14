export type SalesResource = 'quotations' | 'sales-orders' | 'delivery-notes'
export type SalesCleanupRecord = {
  status: string
  sales_order_id?: string | null
  items?: { delivered_qty?: number }[]
}

/** Mirrors backend *_TRANSITIONS and cancellation guards. Never guess that a terminal state can be cancelled. */
export function salesCleanupAction(
  resource: SalesResource,
  record: SalesCleanupRecord,
): 'delete' | 'cancel' | 'retain' {
  if (resource === 'quotations') {
    if (record.sales_order_id) return 'retain' // Cancel the linked SO first, then re-read this quote.
    if (record.status === 'DRAFT') return 'delete'
    return ['SENT', 'APPROVED'].includes(record.status) ? 'cancel' : 'retain'
  }
  if (resource === 'sales-orders') {
    if (record.items?.some((item) => Number(item.delivered_qty) > 0)) return 'retain'
    return ['PENDING_APPROVAL', 'CONFIRMED'].includes(record.status) ? 'cancel' : 'retain'
  }
  if (record.status === 'DRAFT') return 'delete'
  return ['PENDING_APPROVAL', 'SUBMITTED'].includes(record.status) ? 'cancel' : 'retain'
}

export type PurchasingResource = 'purchase-orders' | 'goods-receipts'
export type PurchasingCleanupRecord = {
  status: string
  items?: { received_qty?: number; returned_qty?: number }[]
}
/** Backend PO/GR transition tables and the PO net-received cancellation guard. */
export function purchasingCleanupAction(
  resource: PurchasingResource,
  record: PurchasingCleanupRecord,
): 'delete' | 'cancel' | 'retain' {
  if (record.status === 'DRAFT') return 'delete'
  if (resource === 'goods-receipts') return record.status === 'SUBMITTED' ? 'cancel' : 'retain'
  if (record.items?.some((item) => Number(item.received_qty ?? 0) - Number(item.returned_qty ?? 0) > 0)) return 'retain'
  return ['APPROVED', 'SENT', 'PARTIAL'].includes(record.status) ? 'cancel' : 'retain'
}

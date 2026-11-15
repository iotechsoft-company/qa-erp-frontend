export type StockResource = 'stock-entries' | 'stock-adjustments'
export type StockCleanupRecord = {
  status: string
  created_at?: string
  submitted_at?: string | null
  approved_at?: string | null
  remark?: { th?: string }
}
export function stockCleanupAction(record: StockCleanupRecord) {
  if (record.status === 'DRAFT') return 'delete'
  if (record.status === 'CANCELLED') return 'retain'
  if (record.status === 'SUBMITTED') return 'cancel'
  if (record.status === 'PENDING_APPROVAL') return 'approve-cancel'
  throw new Error(`Unknown stock cleanup state: ${record.status}`)
}
/** Reverse the effective posting order across D1/D2, not merely resource or create order. */
export function stockPostingTime(record: StockCleanupRecord) {
  return Date.parse(record.approved_at ?? record.submitted_at ?? record.created_at ?? '') || 0
}

/** Consumers first, then their source payments; billing releases invoice void guards. */
export const SETTLEMENT_RESOURCES = [
  'customer-refunds',
  'supplier-refunds',
  'credit-applications',
  'supplier-credit-applications',
  'payment-entries',
  'billing-notes',
] as const
export type SettlementResource = (typeof SETTLEMENT_RESOURCES)[number]
export function settlementCleanupAction(resource: SettlementResource, status: string): 'delete' | 'cancel' | 'retain' {
  if (status === 'DRAFT') return 'delete'
  if (status === 'CANCELLED') return 'retain'
  if (status === (resource === 'billing-notes' ? 'ISSUED' : 'SUBMITTED')) return 'cancel'
  throw new Error(`Unknown ${resource} cleanup status '${status}'`)
}

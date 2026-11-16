export type FinanceResource = 'ap-invoices' | 'receipts'
export type FinanceCleanupRecord = {
  status: string
  document_type?: string
  reference_ap_invoice_id?: string | null
  reference_receipt_id?: string | null
}
export const financeCleanupAction = (
  resource: FinanceResource,
  record: FinanceCleanupRecord,
): 'delete' | 'cancel' | 'void' | 'retain' => {
  if (record.status === 'DRAFT') return 'delete'
  if (resource === 'ap-invoices' && record.status === 'SUBMITTED') return 'cancel'
  if (resource === 'receipts' && record.status === 'ISSUED') return 'void'
  return 'retain'
}
/** Adjustments must be reversed/deleted before the original invoice, regardless of list order. */
export const financeCleanupOrder = (a: FinanceCleanupRecord, b: FinanceCleanupRecord) =>
  Number(Boolean(b.reference_ap_invoice_id || b.reference_receipt_id)) -
  Number(Boolean(a.reference_ap_invoice_id || a.reference_receipt_id))

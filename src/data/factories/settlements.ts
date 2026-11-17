import { e2eCode } from './ids'
export type PaymentInput = {
  payment_type: 'RECEIVE' | 'PAY'
  party_id: string
  payment_date: string
  payment_method: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT_CARD' | 'OTHER'
  paid_amount: number
  wht_amount?: number
  currency?: string
  currency_rate?: number
  currency_date?: string
  reference: string
  remark_th: string
  allocations: { receipt_id?: string; ap_invoice_id?: string; allocated_amount: number; wht_amount?: number }[]
}
export type BillingInput = {
  customer_id: string
  document_date: string
  due_date?: string
  receipt_ids: string[]
  remark_th: string
}
export type CreditLineInput = {
  source_payment_entry_id?: string
  source_receipt_id?: string
  source_ap_invoice_id?: string
  target_receipt_id?: string
  target_ap_invoice_id?: string
  amount: number
}
export type CreditInput = {
  customer_id?: string
  supplier_id?: string
  document_date: string
  remark_th: string
  lines: CreditLineInput[]
}
export type RefundInput = {
  customer_id?: string
  supplier_id?: string
  refund_date: string
  payment_method: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT_CARD' | 'OTHER'
  reference: string
  remark_th: string
  lines: Omit<CreditLineInput, 'target_receipt_id' | 'target_ap_invoice_id'>[]
}
export type ScheduleInput = { instalments: { due_date: string; amount: number }[] }
export const buildPayment = (
  refs: { kind: 'ap' | 'ar'; party_id: string; invoice_id: string },
  overrides: Partial<PaymentInput> = {},
): PaymentInput => {
  const marker = e2eCode('PAY')
  return {
    payment_type: refs.kind === 'ap' ? 'PAY' : 'RECEIVE',
    party_id: refs.party_id,
    payment_date: new Date().toISOString(),
    payment_method: 'BANK_TRANSFER',
    paid_amount: 10,
    wht_amount: 0,
    currency: 'THB',
    currency_rate: 1,
    reference: marker,
    remark_th: `${marker} ชำระค่าอุปกรณ์สำนักงาน`,
    allocations: [
      {
        ...(refs.kind === 'ap' ? { ap_invoice_id: refs.invoice_id } : { receipt_id: refs.invoice_id }),
        allocated_amount: 10,
      },
    ],
    ...overrides,
  }
}
export const buildBilling = (
  refs: { customer_id: string; receipt_ids: string[] },
  overrides: Partial<BillingInput> = {},
): BillingInput => ({
  ...refs,
  document_date: new Date().toISOString(),
  remark_th: `${e2eCode('BN')} วางบิลอุปกรณ์สำนักงาน`,
  ...overrides,
})
export const buildCreditApplication = (
  refs: { kind: 'ap' | 'ar'; party_id: string; source_payment_entry_id: string; target_id: string },
  overrides: Partial<CreditInput> = {},
): CreditInput => ({
  ...(refs.kind === 'ap' ? { supplier_id: refs.party_id } : { customer_id: refs.party_id }),
  document_date: new Date().toISOString(),
  remark_th: `${e2eCode('CR')} ตัดเครดิตอุปกรณ์สำนักงาน`,
  lines: [
    {
      source_payment_entry_id: refs.source_payment_entry_id,
      ...(refs.kind === 'ap' ? { target_ap_invoice_id: refs.target_id } : { target_receipt_id: refs.target_id }),
      amount: 10,
    },
  ],
  ...overrides,
})
export const buildRefund = (
  refs: { kind: 'ap' | 'ar'; party_id: string; source_payment_entry_id: string },
  overrides: Partial<RefundInput> = {},
): RefundInput => {
  const marker = e2eCode('REF')
  return {
    ...(refs.kind === 'ap' ? { supplier_id: refs.party_id } : { customer_id: refs.party_id }),
    refund_date: new Date().toISOString(),
    payment_method: 'BANK_TRANSFER',
    reference: marker,
    remark_th: `${marker} คืนเงินส่วนเกิน`,
    lines: [{ source_payment_entry_id: refs.source_payment_entry_id, amount: 10 }],
    ...overrides,
  }
}
export const buildSchedules = (amounts: readonly number[], overrides: Partial<ScheduleInput> = {}): ScheduleInput => ({
  instalments: amounts.map((amount, index) => ({
    due_date: new Date(Date.now() + (index + 1) * 86400000).toISOString(),
    amount,
  })),
  ...overrides,
})

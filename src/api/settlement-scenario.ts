import { expect } from '@playwright/test'
import { type ApiClient } from './api-client'
import { FinanceScenario, type FinanceRecord } from './finance-scenario'
import {
  buildBilling,
  buildCreditApplication,
  buildPayment,
  buildRefund,
  buildSchedules,
  type PaymentInput,
  type BillingInput,
  type CreditInput,
  type RefundInput,
  type ScheduleInput,
  type APInvoiceInput,
  type ReceiptInput,
} from '@data/factories'
import { SETTLEMENT_RESOURCES, settlementCleanupAction, type SettlementResource } from '@data/settlement-cleanup'
export type SettlementRecord = {
  id: string
  status: string
  document_number?: string | null
  payment_number?: string | null
  payment_type?: string
  party_id?: string
  customer_id?: string
  supplier_id?: string
  remark?: { th?: string }
  remark_th?: string
  total: number
  paid_amount: number
  wht_amount: number
  allocated_amount: number
  unallocated_amount: number
  currency: string
  currency_rate: number
  raw_paid_amount: number
  raw_allocated_amount: number
  raw_unallocated_amount: number
  invoices: { receipt_id: string; amount: number }[]
  allocations: { receipt_id?: string; ap_invoice_id?: string; allocated_amount: number; wht_amount: number }[]
  lines: {
    source_payment_entry_id?: string
    source_receipt_id?: string
    source_ap_invoice_id?: string
    target_receipt_id?: string
    target_ap_invoice_id?: string
    amount: number
  }[]
}
export type ScheduleRecord = {
  id: string
  receipt_id: string
  sequence: number
  due_date: string
  amount: number
  credited: number
  settled: number
  outstanding: number
  is_overdue: boolean
}
export class SettlementScenario {
  readonly finance: FinanceScenario
  readonly schedules = new Set<string>()
  invoice!: FinanceRecord
  constructor(
    readonly api: ApiClient,
    readonly kind: 'ap' | 'ar' = 'ar',
  ) {
    this.finance = new FinanceScenario(api, kind)
  }
  get marker() {
    return this.finance.marker
  }
  get partyId() {
    return this.finance.partyId
  }
  get creditResource(): SettlementResource {
    return this.kind === 'ap' ? 'supplier-credit-applications' : 'credit-applications'
  }
  get refundResource(): SettlementResource {
    return this.kind === 'ap' ? 'supplier-refunds' : 'customer-refunds'
  }
  path(resource: SettlementResource) {
    return `/finance-bc/v1/${resource}`
  }
  async seed() {
    await this.finance.seed()
  }
  async newInvoice(input?: APInvoiceInput | ReceiptInput) {
    const draft = await this.finance.create(input)
    const posted = await this.finance.action(draft.id, this.kind === 'ap' ? 'submit' : 'issue')
    this.invoice ??= posted
    return posted
  }
  paymentInput(amount = 10, allocated = amount, invoice = this.invoice, overrides: Partial<PaymentInput> = {}) {
    return buildPayment(
      { kind: this.kind, party_id: this.partyId, invoice_id: invoice.id },
      {
        paid_amount: amount,
        allocations: allocated
          ? [
              {
                ...(this.kind === 'ap' ? { ap_invoice_id: invoice.id } : { receipt_id: invoice.id }),
                allocated_amount: allocated,
              },
            ]
          : [],
        remark_th: `${this.marker} ชำระยอดทดสอบ`,
        ...overrides,
      },
    )
  }
  billingInput(receipts = [this.invoice.id], overrides: Partial<BillingInput> = {}) {
    return buildBilling(
      { customer_id: this.partyId, receipt_ids: receipts },
      { remark_th: `${this.marker} วางบิลทดสอบ`, ...overrides },
    )
  }
  creditInput(sourceId: string, amount = 10, target = this.invoice.id, overrides: Partial<CreditInput> = {}) {
    const input = buildCreditApplication(
      { kind: this.kind, party_id: this.partyId, source_payment_entry_id: sourceId, target_id: target },
      { remark_th: `${this.marker} ตัดเครดิตทดสอบ` },
    )
    input.lines[0]!.amount = amount
    return { ...input, ...overrides }
  }
  refundInput(sourceId: string, amount = 10, overrides: Partial<RefundInput> = {}) {
    const input = buildRefund(
      { kind: this.kind, party_id: this.partyId, source_payment_entry_id: sourceId },
      { remark_th: `${this.marker} คืนเงินทดสอบ` },
    )
    input.lines[0]!.amount = amount
    return { ...input, ...overrides }
  }
  async read(resource: SettlementResource, id: string) {
    const relation =
      resource === 'payment-entries' ? 'allocations' : resource === 'billing-notes' ? 'invoices' : 'lines'
    const j = await this.api.get<{ data: { id: string; attributes: Omit<SettlementRecord, 'id'> } }>(
      `${this.path(resource)}/${id}`,
      { relations: relation },
    )
    return { id: j.data.id, ...j.data.attributes }
  }
  async create(resource: SettlementResource, input: PaymentInput | BillingInput | CreditInput | RefundInput) {
    const created = await this.api.create(this.path(resource), input)
    let doc!: SettlementRecord
    await expect(async () => {
      doc = await this.read(resource, created.id)
      expect(doc.status).toBe('DRAFT')
    }).toPass({ timeout: 10_000 })
    return doc
  }
  async action(resource: SettlementResource, id: string, action: 'submit' | 'issue' | 'cancel') {
    const j = await this.api.post<{ data: { id: string; attributes: Omit<SettlementRecord, 'id'> } }>(
      `${this.path(resource)}/${id}/${action}`,
      action === 'cancel' ? { cancel_reason: `${this.marker} ย้อนยอดทดสอบ` } : {},
    )
    return { id: j.data.id, ...j.data.attributes }
  }
  async aging() {
    return this.api.list<{
      customer_id?: string
      supplier_id?: string
      total: number
      credit_available: number
      net_total: number
      current: number
      no_due_date: number
      days_1_30: number
    }>(`/finance-bc/v1/${this.kind === 'ap' ? 'ap-invoice-agings' : 'receipt-agings'}`, { party_id: this.partyId })
  }
  async records(resource: SettlementResource) {
    return this.api.list<SettlementRecord>(this.path(resource), {
      filter: `remark_th||$starts||${this.marker}`,
      ignore_limit: 'true',
      sort: 'created_at:DESC',
    })
  }
  async scheduleInvoice() {
    if (this.kind !== 'ar') throw new Error('Only receipt schedules are supported')
    return this.newInvoice(
      this.finance.receiptInput({
        remark_th: `${this.marker} [E2E-SCHEDULE] แบ่งชำระอุปกรณ์`,
        due_date: new Date(Date.now() + 14 * 86400000).toISOString(),
      }),
    )
  }
  async replaceSchedules(
    amounts: readonly number[],
    invoiceId = this.invoice.id,
    overrides: Partial<ScheduleInput> = {},
  ) {
    const receipt = await this.finance.read(invoiceId)
    if (
      !receipt.remark.th?.startsWith(this.marker) ||
      !receipt.remark.th.includes('[E2E-SCHEDULE]') ||
      receipt.customer_id !== this.partyId
    )
      throw new Error('Schedules require a marked owned receipt')
    this.schedules.add(invoiceId)
    return this.api.put(`/finance-bc/v1/receipts/${invoiceId}/payment-schedules`, buildSchedules(amounts, overrides))
  }
  async readSchedules(invoiceId = this.invoice.id) {
    return this.api.list<ScheduleRecord>(`/finance-bc/v1/receipts/${invoiceId}/payment-schedules`)
  }
  async snapshot() {
    const docs = await Promise.all(
      SETTLEMENT_RESOURCES.map(async (resource) => ({
        resource,
        rows: await Promise.all(
          (await this.records(resource)).map(async (row) => ({
            id: row.id,
            status: row.status,
            total: row.total,
            paid: row.paid_amount,
            allocated: row.allocated_amount,
            unallocated: row.unallocated_amount,
            ledger: await this.finance.ledger(row.id),
          })),
        ),
      })),
    )
    return { documents: docs, aging: await this.aging(), stock: await this.finance.source.inventory.stockQty() }
  }
  async cleanup() {
    const errors: unknown[] = []
    const attempt = async (run: () => Promise<void>) => {
      try {
        await run()
      } catch (error) {
        errors.push(error)
      }
    }
    for (const resource of SETTLEMENT_RESOURCES)
      await attempt(async () => {
        for (const row of await this.records(resource))
          await attempt(async () => {
            if (
              !(row.remark?.th ?? row.remark_th)?.startsWith(this.marker) ||
              (row.party_id ?? row.customer_id ?? row.supplier_id) !== this.partyId
            )
              throw new Error('Refusing cleanup of foreign settlement')
            const action = settlementCleanupAction(resource, row.status)
            if (action === 'delete') await this.api.delete(`${this.path(resource)}/${row.id}`)
            else if (action === 'cancel') await this.action(resource, row.id, 'cancel')
            await expect(async () => {
              const lines = await this.finance.ledger(row.id)
              for (const account of new Set(lines.map((l) => l.account_id)))
                expect(
                  Math.round(
                    lines.filter((l) => l.account_id === account).reduce((sum, l) => sum + l.debit - l.credit, 0) *
                      10_000,
                  ),
                ).toBe(0)
            }).toPass({ timeout: 10_000 })
          })
      })
    for (const id of this.schedules)
      await attempt(async () => {
        if ((await this.readSchedules(id)).length)
          await this.api.delete(`/finance-bc/v1/receipts/${id}/payment-schedules`)
      })
    await attempt(() => this.finance.cleanup())
    if (errors.length) throw new AggregateError(errors, 'Settlement cleanup failed')
  }
}

import { expect } from '@playwright/test'
import { buildAPInvoice, buildReceipt, e2eCode, type APInvoiceInput, type ReceiptInput } from '@data/factories'
import { financeCleanupAction, financeCleanupOrder, type FinanceResource } from '@data/finance-cleanup'
import { ReturnScenario } from './return-scenario'
import { type ApiClient } from './api-client'
export type FinanceRecord = {
  id: string
  status: string
  document_type: string
  document_number: string | null
  vendor_document_number?: string
  supplier_id?: string
  customer_id?: string
  reference_ap_invoice_id?: string | null
  reference_receipt_id?: string | null
  adjustment_reason?: string | null
  remark: { th?: string | null }
  document_date: string
  due_date?: string | null
  vat_rate: number
  vat_amount: number
  net_amount: number
  total: number
  currency: string
  currency_rate: number
  raw_total: number
  raw_total_wht: number
  total_wht: number
  sub_total: number
  total_discount: number
  is_vat_included: boolean
  items: {
    id: string
    product_id: string
    grn_item_id?: string
    dn_item_id?: string
    qty: number
    unit_cost?: number
    unit_price?: number
    line_total: number
    vat_amount: number
    vat_rate: number
    vat_treatment: string
  }[]
}
export type FinanceLedger = {
  id: string
  journal_id: string
  account_id: string
  debit: number
  credit: number
  ref_doc_id: string
  ref_doc_type: string
}
/** Owned finance documents only. Reverse adjustments before originals, then unwind stock sources. */
export class FinanceScenario {
  readonly marker = e2eCode('FIN')
  readonly source: ReturnScenario
  readonly resource: FinanceResource
  readonly accounts = new Map<string, string>()
  vatRate = 0
  constructor(
    readonly api: ApiClient,
    readonly kind: 'ap' | 'ar',
  ) {
    this.resource = kind === 'ap' ? 'ap-invoices' : 'receipts'
    this.source = new ReturnScenario(api, kind === 'ap' ? 'purchase' : 'sales')
  }
  get path() {
    return `/finance-bc/v1/${this.resource}`
  }
  get productId() {
    return this.source.productId
  }
  get partyId() {
    return this.kind === 'ap' ? this.source.inventory.supplierId : this.source.fulfillment!.sales.customerId
  }
  async seed(submitSource = true) {
    await this.source.seed(submitSource)
    const accounts = await this.api.list<{ account_role: string; is_active: boolean }>('/finance-bc/v1/gl-accounts', {
      ignore_limit: 'true',
    })
    for (const a of accounts) if (a.account_role && a.is_active) this.accounts.set(a.account_role, a.id)
    const taxes = await this.api.list<{
      tax_type: string
      rate: number
      is_active: boolean
      effective_from: string
      effective_upto: string | null
    }>('/finance-bc/v1/tax-configs', { ignore_limit: 'true' })
    const now = Date.now()
    const effective = taxes
      .filter(
        (t) =>
          t.tax_type === 'vat' &&
          t.is_active &&
          new Date(t.effective_from).getTime() <= now &&
          (!t.effective_upto || new Date(t.effective_upto).getTime() >= now),
      )
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
    if (!effective[0]) throw new Error('Finance scenario requires a current read-only VAT reference')
    this.vatRate = effective[0].rate
  }
  apInput(overrides: Partial<APInvoiceInput> = {}) {
    return buildAPInvoice(
      { supplier_id: this.partyId, grn_item_id: this.source.source.items[0]!.id },
      { remark_th: `${this.marker} ใบแจ้งหนี้อุปกรณ์`, ...overrides },
    )
  }
  receiptInput(overrides: Partial<ReceiptInput> = {}) {
    return buildReceipt(
      { customer_id: this.partyId, product_id: this.productId },
      {
        delivery_note_id: this.source.source.id,
        remark_th: `${this.marker} ใบกำกับอุปกรณ์`,
        items: [{ dn_item_id: this.source.source.items[0]!.id, product_id: this.productId, qty: 1, unit_price: 150 }],
        ...overrides,
      },
    )
  }
  input() {
    return this.kind === 'ap' ? this.apInput() : this.receiptInput()
  }
  async read(id: string) {
    const j = await this.api.get<{ data: { id: string; attributes: Omit<FinanceRecord, 'id'> } }>(
      `${this.path}/${id}`,
      { relations: 'items' },
    )
    return { id: j.data.id, ...j.data.attributes }
  }
  async create(input: APInvoiceInput | ReceiptInput = this.input()) {
    const created = await this.api.create(this.path, input)
    let record!: FinanceRecord
    await expect(async () => {
      record = await this.read(created.id)
      expect(record.items.length).toBeGreaterThan(0)
    }).toPass({ timeout: 10_000 })
    return record
  }
  async action(id: string, action: 'submit' | 'issue' | 'cancel' | 'void') {
    const j = await this.api.post<{ data: { id: string; attributes: Omit<FinanceRecord, 'id'> } }>(
      `${this.path}/${id}/${action}`,
      action === 'cancel'
        ? { cancel_reason: `${this.marker} ย้อนเอกสาร` }
        : action === 'void'
          ? { void_reason: `${this.marker} ย้อนเอกสาร` }
          : {},
    )
    return { id: j.data.id, ...j.data.attributes }
  }
  async ledger(id: string) {
    return this.api.list<FinanceLedger>('/finance-bc/v1/ledger-entries', {
      filter: `ref_doc_id||$eq||${id}`,
      ignore_limit: 'true',
      sort: 'id:ASC',
    })
  }
  async records() {
    return this.api.list<FinanceRecord>(this.path, {
      filter: `remark_th||$starts||${this.marker}`,
      ignore_limit: 'true',
      sort: 'created_at:DESC',
    })
  }
  /** Only the E2E marker plus the explicitly owned party can authorize reversal. */
  async cleanupParty(partyId = this.partyId) {
    const errors: unknown[] = []
    for (const row of (await this.records())
      .filter((row) => (this.kind === 'ap' ? row.supplier_id : row.customer_id) === partyId)
      .sort(financeCleanupOrder)) {
      try {
        if (!row.remark?.th?.startsWith(this.marker)) throw new Error('Refusing cleanup of unowned finance document')
        const action = financeCleanupAction(this.resource, row)
        if (action === 'delete') await this.api.delete(`${this.path}/${row.id}`)
        else if (action !== 'retain') await this.action(row.id, action)
        await expect(async () => {
          const lines = await this.ledger(row.id)
          for (const account of new Set(lines.map((line) => line.account_id)))
            expect(
              Math.round(
                lines
                  .filter((line) => line.account_id === account)
                  .reduce((sum, line) => sum + line.debit - line.credit, 0) * 10_000,
              ),
            ).toBe(0)
        }).toPass({ timeout: 10_000 })
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Owned party finance cleanup failed')
  }
  async cleanup() {
    const errors: unknown[] = []
    try {
      await this.cleanupParty()
    } catch (error) {
      errors.push(error)
    }
    try {
      await this.source.cleanup()
    } catch (error) {
      errors.push(error)
    }
    if (errors.length) throw new AggregateError(errors, 'Owned finance cleanup failed')
  }
}

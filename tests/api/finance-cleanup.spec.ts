import { FinanceScenario, type FinanceRecord, type FinanceLedger } from '@api/finance-scenario'
import { expect, test } from '@fixtures/test'

class DelayedLedger extends FinanceScenario {
  writes: string[] = []
  reads = 0
  override async records() {
    return [
      {
        id: 'secondary-document',
        supplier_id: 'owned-secondary',
        remark: { th: this.marker },
        status: 'SUBMITTED',
        document_type: 'VENDOR_BILL',
      },
      {
        id: 'other-document',
        supplier_id: 'foreign-party',
        remark: { th: this.marker },
        status: 'SUBMITTED',
        document_type: 'VENDOR_BILL',
      },
    ] as FinanceRecord[]
  }
  override async action(id: string) {
    this.writes.push(id)
    return { id, status: 'CANCELLED' } as FinanceRecord
  }
  override async ledger(): Promise<FinanceLedger[]> {
    this.reads++
    const base = { id: 'line', journal_id: 'posted', ref_doc_id: 'secondary-document', ref_doc_type: 'AP_INVOICE' }
    const original = [
      { ...base, account_id: 'inventory', debit: 10, credit: 0 },
      { ...base, account_id: 'payable', debit: 0, credit: 10 },
    ]
    // Globally balanced throughout, but not zero per account until async reversal arrives.
    return this.reads === 1
      ? original
      : [
          ...original,
          ...original.map((row) => ({
            ...row,
            id: `${row.account_id}-reverse`,
            journal_id: 'reversal',
            debit: row.credit,
            credit: row.debit,
          })),
        ]
  }
}

test(
  'PR #12: secondary-party cleanup waits for each account reversal without repeating writes',
  { tag: ['@finance', '@api', '@regression'] },
  async ({ api }) => {
    const secondary = 'owned-secondary'
    const scenario = new DelayedLedger(api, 'ap')
    await scenario.cleanupParty(secondary)
    expect(scenario.writes).toEqual(['secondary-document'])
    expect(scenario.reads).toBeGreaterThanOrEqual(2)
  },
)

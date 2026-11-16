import { expect } from '@fixtures/test'
import { type FinanceRecord, type FinanceScenario } from '@api/finance-scenario'
// Wire money uses numeric(18,4); source: libs/common/src/utils/discount.util.ts (roundMoney).
export const money = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000
export async function posting(s: FinanceScenario, doc: FinanceRecord, reversed = false) {
  await expect(async () => {
    const rows = await s.ledger(doc.id)
    if (doc.document_type === 'RECEIPT' || doc.document_type === 'PROFORMA_INVOICE') {
      expect(rows).toEqual([])
      return
    }
    expect(rows).toHaveLength((doc.vat_amount > 0 ? 3 : 2) * (reversed ? 2 : 1))
    expect(money(rows.reduce((sum, l) => sum + l.debit, 0))).toBe(money(rows.reduce((sum, l) => sum + l.credit, 0)))
    expect(new Set(rows.map((l) => l.journal_id)).size).toBe(reversed ? 2 : 1)
    const credit = doc.document_type === 'CREDIT_NOTE' ? -1 : 1
    const expected =
      s.kind === 'ap'
        ? {
            INVENTORY: credit * doc.net_amount,
            INPUT_VAT: credit * doc.vat_amount,
            ACCOUNTS_PAYABLE: -credit * doc.total,
          }
        : {
            ACCOUNTS_RECEIVABLE: credit * doc.total,
            SALES_REVENUE: -credit * doc.net_amount,
            OUTPUT_VAT: -credit * doc.vat_amount,
          }
    for (const [role, amount] of Object.entries(expected)) {
      const account = s.accounts.get(role)
      expect(account, `Existing GL role ${role}`).toBeDefined()
      expect(money(rows.filter((l) => l.account_id === account).reduce((sum, l) => sum + l.debit - l.credit, 0))).toBe(
        reversed ? 0 : money(amount),
      )
    }
    const expectedAccounts = Object.entries(expected)
      .filter(([, v]) => v !== 0)
      .map(([role]) => s.accounts.get(role))
    expect([...new Set(rows.map((l) => l.account_id))].sort()).toEqual(expectedAccounts.sort())
  }).toPass({ timeout: 10_000 })
}
export async function debt(s: FinanceScenario, total: number) {
  const endpoint = s.kind === 'ap' ? 'ap-invoice-agings' : 'receipt-agings'
  await expect(async () => {
    const rows = await s.api.list<{ supplier_id?: string; customer_id?: string; total: number; net_total: number }>(
      `/finance-bc/v1/${endpoint}`,
      { party_id: s.partyId },
    )
    for (const row of rows) expect(row.supplier_id ?? row.customer_id).toBe(s.partyId)
    expect(money(rows.reduce((sum, r) => sum + r.net_total, 0))).toBe(money(total))
  }).toPass({ timeout: 10_000 })
}
export async function rejected(
  response: { status(): number; json(): Promise<unknown> },
  status: number,
  detail: string,
) {
  expect(response.status()).toBe(status)
  expect(await response.json()).toMatchObject({
    status: { code: status * 1000, message: detail },
    errors: [{ detail }],
  })
}
export async function snapshot(s: FinanceScenario) {
  return {
    source: await s.source.snapshot(),
    documents: await Promise.all(
      (await s.records()).map(async (row) => ({
        id: row.id,
        status: row.status,
        total: row.total,
        number: row.document_number,
        ledger: await s.ledger(row.id),
      })),
    ),
  }
}

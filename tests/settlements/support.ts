import { type SettlementScenario } from '@api/settlement-scenario'
import { expect } from '@fixtures/test'
export { money, rejected } from '../finance/support'
import { money } from '../finance/support'
export async function balances(s: SettlementScenario, total: number, credit = 0) {
  await expect(async () => {
    const rows = await s.aging()
    for (const row of rows) expect(row.customer_id ?? row.supplier_id).toBe(s.partyId)
    expect(money(rows.reduce((n, r) => n + r.total, 0))).toBe(money(total))
    expect(money(rows.reduce((n, r) => n + r.credit_available, 0))).toBe(money(credit))
    expect(money(rows.reduce((n, r) => n + r.net_total, 0))).toBe(money(total - credit))
  }).toPass({ timeout: 10_000 })
}
export async function journal(s: SettlementScenario, id: string, roles: Record<string, number>, reversed = false) {
  await expect(async () => {
    const rows = await s.finance.ledger(id)
    const nonzero = Object.entries(roles).filter(([, v]) => v !== 0)
    expect(rows).toHaveLength(nonzero.length * (reversed ? 2 : 1))
    expect(new Set(rows.map((l) => l.journal_id)).size).toBe(nonzero.length ? (reversed ? 2 : 1) : 0)
    expect(money(rows.reduce((n, l) => n + l.debit, 0))).toBe(money(rows.reduce((n, l) => n + l.credit, 0)))
    for (const [role, amount] of nonzero) {
      const account = s.finance.accounts.get(role)
      expect(account, role).toBeDefined()
      expect(money(rows.filter((l) => l.account_id === account).reduce((n, l) => n + l.debit - l.credit, 0))).toBe(
        reversed ? 0 : money(amount),
      )
    }
    expect([...new Set(rows.map((l) => l.account_id))].sort()).toEqual(
      nonzero.map(([role]) => s.finance.accounts.get(role)).sort(),
    )
  }).toPass({ timeout: 10_000 })
}

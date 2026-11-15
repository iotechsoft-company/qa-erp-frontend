import { type SalesFulfillmentScenario } from '@api/sales-fulfillment-scenario'
import { expect } from '@fixtures/test'

export async function expectFinancial(
  s: SalesFulfillmentScenario,
  saleId: string,
  allocations: { lotId: string; qty: number; unitCost: number }[],
  revenue: number,
) {
  const qty = allocations.reduce((sum, lot) => sum + lot.qty, 0)
  const cost = allocations.reduce((sum, lot) => sum + lot.qty * lot.unitCost, 0)
  await expect(async () => {
    const costs = (await s.costs()).filter((row) => row.sale_id === saleId)
    const profits = (await s.profits()).filter((row) => row.sale_id === saleId)
    expect(costs).toHaveLength(allocations.length)
    expect(profits).toHaveLength(allocations.length)
    for (const allocation of allocations) {
      expect(costs).toContainEqual(
        expect.objectContaining({
          sale_id: saleId,
          product_id: s.sales.productId,
          lot_id: allocation.lotId,
          qty: allocation.qty,
          unit_cost: allocation.unitCost,
          cogs: allocation.qty * allocation.unitCost,
        }),
      )
      expect(profits).toContainEqual(
        expect.objectContaining({
          sale_id: saleId,
          customer_id: s.sales.customerId,
          lot_id: allocation.lotId,
          revenue: (revenue * allocation.qty) / qty,
          cogs: allocation.qty * allocation.unitCost,
          gross_profit: (revenue * allocation.qty) / qty - allocation.qty * allocation.unitCost,
        }),
      )
    }
    const journal = await s.journals(saleId)
    expect(journal).toHaveLength(2)
    expect(new Set(journal.map((row) => row.journal_id)).size).toBe(1)
    expect(
      journal.every((row) => row.ref_doc_type === 'DELIVERY_LINE' && row.ref_doc_id === saleId && !row.is_cancelled),
    ).toBe(true)
    expect(journal.reduce((sum, row) => sum + row.debit, 0)).toBe(cost)
    expect(journal.reduce((sum, row) => sum + row.credit, 0)).toBe(cost)
  }).toPass({ timeout: 10_000 })
}
export async function expectFinancialReversed(s: SalesFulfillmentScenario, saleId: string, cost: number) {
  await expect(async () => {
    expect((await s.costs()).filter((row) => row.sale_id === saleId)).toEqual([])
    expect((await s.profits()).filter((row) => row.sale_id === saleId)).toEqual([])
    const journal = await s.journals(saleId)
    expect(journal).toHaveLength(4)
    expect(new Set(journal.map((row) => row.journal_id)).size).toBe(2)
    expect(journal.filter((row) => row.is_cancelled)).toHaveLength(2)
    expect(journal.reduce((sum, row) => sum + row.debit, 0)).toBe(2 * cost)
    expect(journal.reduce((sum, row) => sum + row.credit, 0)).toBe(2 * cost)
    const accountIds = new Set(journal.map((row) => row.account_id))
    expect(accountIds.size).toBe(2)
    for (const id of accountIds)
      expect(journal.filter((row) => row.account_id === id).reduce((sum, row) => sum + row.debit - row.credit, 0)).toBe(
        0,
      )
  }).toPass({ timeout: 10_000 })
}

export async function expectRejection(
  response: { status(): number; json(): Promise<unknown> },
  status: 409,
  detail: string,
  code: 'CONFLICT' | 'INSUFFICIENT_STOCK' = 'CONFLICT',
  meta?: { product_id: string; warehouse_id: string; requested: number; available: number },
) {
  expect(response.status()).toBe(status)
  expect(await response.json()).toMatchObject({
    status: { code: 409000, message: detail },
    errors: [{ code, detail, ...(meta ? { meta } : {}) }],
  })
}

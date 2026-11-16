import { type ReturnScenario } from '@api/return-scenario'
import { expect } from '@fixtures/test'
export async function quantities(s: ReturnScenario, stock: number, returned: number, status: string) {
  await expect(async () => {
    expect(await s.inventory.stockQty()).toBe(stock)
    const order = await s.order()
    expect(order.status).toBe(status)
    expect(order.items![0]!.returned_qty).toBe(returned)
  }).toPass({ timeout: 10_000 })
}
export async function cogs(s: ReturnScenario, qty: number, total: number, journalCount: number) {
  const fulfillment = s.fulfillment!
  await expect(async () => {
    const rows = await fulfillment.costs()
    expect(rows.reduce((sum, row) => sum + row.qty, 0)).toBe(qty)
    expect(rows.reduce((sum, row) => sum + row.cogs, 0)).toBe(total)
    for (const row of rows)
      expect(row).toMatchObject({
        sale_id: s.source.items[0]!.id,
        product_id: s.productId,
        unit_cost: fulfillment.stock.lots.find((lot) => lot.id === row.lot_id)!.unitCost,
      })
    const journal = await fulfillment.journals(s.source.items[0]!.id)
    expect(journal).toHaveLength(journalCount)
    expect(journal.reduce((sum, row) => sum + row.debit, 0)).toBe(journal.reduce((sum, row) => sum + row.credit, 0))
    expect(new Set(journal.map((row) => row.account_id)).size).toBe(2)
    for (const account of new Set(journal.map((row) => row.account_id)))
      expect(
        Math.abs(
          journal.filter((row) => row.account_id === account).reduce((sum, row) => sum + row.debit - row.credit, 0),
        ),
      ).toBe(total)
  }).toPass({ timeout: 10_000 })
}
export async function ledger(
  s: ReturnScenario,
  sourceId: string,
  lotId: string,
  qty: number,
  cost: number,
  type: string,
) {
  await expect(async () => {
    expect((await s.movements()).filter((row) => row.source_doc_id === sourceId)).toContainEqual(
      expect.objectContaining({ lot_id: lotId, qty, unit_cost: cost, type }),
    )
  }).toPass({ timeout: 10_000 })
}
export async function rejection(
  response: { status(): number; json(): Promise<unknown> },
  status: number,
  detail: string,
  code = 'CONFLICT',
) {
  expect(response.status()).toBe(status)
  expect(await response.json()).toMatchObject({
    status: { code: status * 1000, message: detail },
    errors: [{ code, detail }],
  })
}

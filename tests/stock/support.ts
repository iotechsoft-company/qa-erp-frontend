import { expect } from '@fixtures/test'
import { type StockScenario, type StockDocument } from '@api/stock-scenario'
import { type APIResponse } from '@playwright/test'
export async function reject(response: APIResponse, status: number, detail: string, code = 'CONFLICT') {
  expect(response.status()).toBe(status)
  expect(await response.json()).toMatchObject({
    status: { code: status * 1000, message: detail },
    errors: [{ code, detail }],
  })
}
export async function quantity(s: StockScenario, qty: number, productId = s.productId, warehouseId = s.warehouseId) {
  await expect.poll(() => s.quantity(productId, warehouseId), { timeout: 10_000 }).toBe(qty)
}
export async function movement(
  s: StockScenario,
  doc: StockDocument,
  qty: number,
  cost: number,
  type: string,
  lotId: string,
) {
  const rows = (await s.movements()).filter((row) => row.source_doc_id === doc.id)
  expect(rows).toContainEqual(
    expect.objectContaining({ type, lot_id: lotId, qty, unit_cost: cost, source_doc_type: 'STOCK_ENTRY' }),
  )
}
export async function zeroNetMovements(s: StockScenario, id: string) {
  await expect(async () => {
    const rows = (await s.movements()).filter((row) => row.source_doc_id === id)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.reduce((sum, row) => sum + row.qty * row.unit_cost, 0)).toBe(0)
    const lotIds = new Set(rows.map((row) => row.lot_id))
    for (const lotId of lotIds)
      expect(rows.filter((row) => row.lot_id === lotId).reduce((sum, row) => sum + row.qty, 0)).toBe(0)
  }).toPass({ timeout: 10_000 })
}

export async function expectPosting(s: StockScenario, doc: StockDocument, sourceLot: string) {
  const rows = {
    MATERIAL_RECEIPT: [14, 0, 0],
    MATERIAL_ISSUE: [7, 0, 0],
    MATERIAL_TRANSFER: [8, 2, 0],
    REPACK: [6, 0, 2],
  }[doc.entry_type!]!
  await quantity(s, rows[0]!)
  await quantity(s, rows[1]!, s.productId, s.destinationWarehouseId)
  await quantity(s, rows[2]!, s.secondProductId)
  const checks = {
    MATERIAL_RECEIPT: async () => {
      expect(doc.items[0]!.line_total).toBe(50)
      await movement(s, doc, 4, 12.5, 'RECEIPT', doc.items[0]!.target_lot_id!)
    },
    MATERIAL_ISSUE: async () => {
      expect(doc.items[0]!.line_total).toBe(37.5)
      await movement(s, doc, -3, 12.5, 'ISSUE', sourceLot)
    },
    MATERIAL_TRANSFER: async () => {
      expect(doc.items[0]!.line_total).toBe(25)
      await movement(s, doc, -2, 12.5, 'TRANSFER_OUT', sourceLot)
      await movement(s, doc, 2, 12.5, 'TRANSFER_IN', doc.items[0]!.target_lot_id!)
      expect((await s.lots()).find((l) => l.id === doc.items[0]!.target_lot_id)).toMatchObject({
        warehouse_id: s.destinationWarehouseId,
        received_qty: 2,
        available_qty: 2,
        import_cost: 12.5,
      })
    },
    REPACK: async () => {
      const target = doc.items.find((line) => line.product_id === s.secondProductId)!
      expect(doc.items.find((line) => line.product_id === s.productId)!.line_total).toBe(50)
      expect(target).toMatchObject({ qty: 2, import_cost: 25, line_total: 50 })
      await movement(s, doc, -4, 12.5, 'ISSUE', sourceLot)
      await movement(s, doc, 2, 25, 'RECEIPT', target.target_lot_id!)
    },
  }
  await checks[doc.entry_type!]!()
}

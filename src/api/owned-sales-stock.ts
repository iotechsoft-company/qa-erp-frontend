import { expect } from '@playwright/test'
import { type ApiClient } from './api-client'
import { PurchasingScenario } from './purchasing-scenario'
import { type SalesStockSource } from './sales-scenario'

export type OwnedStockLotInput = { qty: number; unitCost: number; expiryDate?: string }
export type OwnedStockLot = OwnedStockLotInput & { id: string; lotNumber: string }
/** Own GR stock for Sales scenarios; always reverse it after Sales documents are cleaned. */
export class OwnedSalesStock implements SalesStockSource {
  readonly inventory: PurchasingScenario
  private baseline: unknown
  readonly lots: OwnedStockLot[] = []
  constructor(
    private readonly api: ApiClient,
    private readonly inputs: readonly OwnedStockLotInput[] = [{ qty: 1, unitCost: 100 }],
  ) {
    this.inventory = new PurchasingScenario(api)
  }
  async seed() {
    await this.inventory.seed()
    for (const input of this.inputs) {
      const order = await this.inventory.createOrder(true, {
        items: [
          {
            product_id: this.inventory.productId,
            qty: input.qty,
            unit_cost: input.unitCost,
            discount_type: 'amount',
            discount: 0,
          },
        ],
      })
      const payload = this.inventory.receiptInput(order)
      payload.items[0]!.qty = input.qty
      payload.items[0]!.import_cost = input.unitCost
      payload.items[0]!.expiry_date = input.expiryDate
      const receipt = await this.api.create('/inventory-bc/v1/goods-receipts', payload)
      const submitted = await this.api.post<{ data: { attributes: { items: { lot_id: string }[] } } }>(
        `/inventory-bc/v1/goods-receipts/${receipt.id}/submit`,
        {},
      )
      const id = submitted.data.attributes.items[0]!.lot_id
      expect(id).toEqual(expect.any(String))
      this.lots.push({ ...input, id, lotNumber: payload.items[0]!.lot_number })
    }
    await expect.poll(() => this.inventory.stockQty()).toBe(this.inputs.reduce((qty, lot) => qty + lot.qty, 0))
    this.baseline = await this.snapshot()
    return {
      product_id: this.inventory.productId,
      product_sku: this.inventory.sku,
      warehouse_id: this.inventory.warehouseId,
      warehouse_name: this.inventory.warehouseName,
    }
  }
  private async snapshot() {
    const [qty, entries] = await Promise.all([
      this.inventory.stockQty(),
      this.api.list<{ type: string; qty: number; unit_cost: number; source_doc_id: string; balance_after: number }>(
        '/inventory-bc/v1/stock-ledger-entries',
        { product_id: this.inventory.productId, limit: 100 },
      ),
    ])
    return {
      qty,
      ledger: entries.map(({ id, type, qty, unit_cost, source_doc_id, balance_after }) => ({
        id,
        type,
        qty,
        unit_cost,
        source_doc_id,
        balance_after,
      })),
    }
  }
  /** Sample a bounded stability window; keep every sample so a transient movement cannot be hidden. */
  async expectUnchanged() {
    const observations: unknown[] = []
    const until = performance.now() + 1000
    await expect
      .poll(
        async () => {
          observations.push(await this.snapshot())
          return performance.now() >= until && observations.length >= 3
        },
        { timeout: 5000, intervals: [100, 200, 400] },
      )
      .toBe(true)
    for (const observed of observations) expect(observed).toEqual(this.baseline)
  }
  async cleanup() {
    await this.inventory.cleanup()
  }
}

import { expect } from '@playwright/test'
import { type ApiClient } from './api-client'
import { PurchasingScenario } from './purchasing-scenario'
import { type SalesStockSource } from './sales-scenario'

/** Own GR stock for Sales scenarios; always reverse it after Sales documents are cleaned. */
export class OwnedSalesStock implements SalesStockSource {
  readonly inventory: PurchasingScenario
  private baseline: unknown
  constructor(private readonly api: ApiClient) {
    this.inventory = new PurchasingScenario(api)
  }
  async seed() {
    await this.inventory.seed()
    const receipt = await this.inventory.createReceipt()
    await this.api.post(`/inventory-bc/v1/goods-receipts/${receipt.id}/submit`, {})
    await expect.poll(() => this.inventory.stockQty()).toBe(1)
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

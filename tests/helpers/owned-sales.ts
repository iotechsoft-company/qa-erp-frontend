import { type ApiClient } from '@api/api-client'
import { PurchasingScenario } from '@api/purchasing-scenario'
import { SalesScenario } from '@api/sales-scenario'
import { expect } from '@fixtures/test'

/** Only the migrated create paths use owned stock; never post a movement against a shared catalogue item. */
export class OwnedSalesScenario extends SalesScenario {
  readonly inventory: PurchasingScenario
  constructor(api: ApiClient) {
    super(api)
    this.inventory = new PurchasingScenario(api)
  }
  override async seed() {
    await this.inventory.seed()
    const receipt = await this.inventory.createReceipt()
    await this.api.post(`/inventory-bc/v1/goods-receipts/${receipt.id}/submit`, {})
    await expect.poll(() => this.inventory.stockQty()).toBe(1)
    await super.seed({
      product_id: this.inventory.productId,
      product_sku: this.inventory.sku,
      warehouse_id: this.inventory.warehouseId,
    })
  }
  override async cleanup() {
    try {
      await super.cleanup()
    } finally {
      await this.inventory.cleanup()
    }
  }
}

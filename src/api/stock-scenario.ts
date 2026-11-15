import { expect } from '@playwright/test'
import { buildProduct, buildStockEntry, buildStockAdjustment, e2eCode, type StockEntryType } from '@data/factories'
import { stockCleanupAction, stockPostingTime, type StockResource, type StockCleanupRecord } from '@data/stock-cleanup'
import { PurchasingScenario } from './purchasing-scenario'
import { type ApiClient } from './api-client'

export type StockDocument = StockCleanupRecord & {
  id: string
  entry_number?: string
  adjustment_number?: string
  entry_type?: StockEntryType
  adjustment_value_snapshot?: number
  approval_threshold_snapshot?: number
  items: {
    id: string
    product_id: string
    qty: number
    target_lot_id?: string
    source_lot_id?: string
    line_role?: string
    import_cost?: number
    line_total?: number
    lot_id?: string
    system_qty?: number
    counted_qty?: number
  }[]
}
export type StockLot = {
  product_id: string
  warehouse_id: string
  lot_number: string
  received_qty: number
  available_qty: number
  import_cost: number
  expiry_date: string | null
}
export type StockMovement = {
  type: string
  lot_id: string
  product_id: string
  warehouse_id: string
  qty: number
  unit_cost: number
  source_doc_type: string
  source_doc_id: string
}

/** Own masters and every movement. Never writes warehouse settings or shared product stock. */
export class StockScenario {
  readonly marker = e2eCode('STOCK')
  readonly inventory: PurchasingScenario
  secondProductId = ''
  destinationWarehouseId = ''
  constructor(readonly api: ApiClient) {
    this.inventory = new PurchasingScenario(api)
  }
  get productId() {
    return this.inventory.productId
  }
  get warehouseId() {
    return this.inventory.warehouseId
  }
  async seed() {
    await this.inventory.seed()
    const warehouses = await this.api.list<{ warehouse_type: string; is_group: boolean }>(
      '/inventory-bc/v1/warehouses',
      { filter: 'is_group||$eq||false', ignore_limit: 'true' },
    )
    const target = warehouses.find((w) => w.warehouse_type === 'stock' && w.id !== this.warehouseId)
    if (!target) throw new Error('Stock transfer tests need two stock leaf warehouses')
    this.destinationWarehouseId = target.id
    const input = buildProduct({
      item_group_id: await this.api.firstId('/inventory-bc/v1/item-groups', { filter: 'is_group||$eq||false' }),
      stock_uom_id: await this.api.firstId('/inventory-bc/v1/uoms'),
    })
    const created = await this.api.create('/inventory-bc/v1/products', input)
    this.secondProductId = created.id
  }
  receiptInput(qty = 10, cost = 1, productId = this.productId) {
    return buildStockEntry({
      entry_type: 'MATERIAL_RECEIPT',
      to_warehouse_id: this.warehouseId,
      remark_th: `${this.marker} รับเครื่องเขียน`,
      items: [{ product_id: productId, qty, import_cost: cost, lot_number: e2eCode('LOT') }],
    })
  }
  issueInput(qty = 1, productId = this.productId, warehouseId = this.warehouseId) {
    return buildStockEntry({
      entry_type: 'MATERIAL_ISSUE',
      from_warehouse_id: warehouseId,
      remark_th: `${this.marker} เบิกเครื่องเขียน`,
      items: [{ product_id: productId, qty }],
    })
  }
  transferInput(lotId: string, qty = 2) {
    return buildStockEntry({
      entry_type: 'MATERIAL_TRANSFER',
      from_warehouse_id: this.warehouseId,
      to_warehouse_id: this.destinationWarehouseId,
      remark_th: `${this.marker} โอนเครื่องเขียน`,
      items: [{ product_id: this.productId, source_lot_id: lotId, qty }],
    })
  }
  repackInput(sourceQty = 4, targetQty = 2) {
    return buildStockEntry({
      entry_type: 'REPACK',
      from_warehouse_id: this.warehouseId,
      remark_th: `${this.marker} แบ่งบรรจุเครื่องเขียน`,
      items: [
        { product_id: this.productId, qty: sourceQty, line_role: 'SOURCE' },
        { product_id: this.secondProductId, qty: targetQty, line_role: 'DESTINATION', lot_number: e2eCode('REPACK') },
      ],
    })
  }
  adjustmentInput(lotId: string, countedQty: number) {
    return buildStockAdjustment(
      { warehouse_id: this.warehouseId, items: [{ lot_id: lotId, counted_qty: countedQty }] },
      { remark_th: `${this.marker} ตรวจนับเครื่องเขียน` },
    )
  }
  async read(resource: StockResource, id: string) {
    const json = await this.api.get<{ data: { id: string; attributes: Omit<StockDocument, 'id'> } }>(
      `/inventory-bc/v1/${resource}/${id}`,
      { relations: 'items' },
    )
    return { id: json.data.id, ...json.data.attributes }
  }
  async visible(resource: StockResource, id: string) {
    let result!: StockDocument
    await expect(async () => {
      result = await this.read(resource, id)
      expect(result.id).toBe(id)
      expect(result.items.length).toBeGreaterThan(0)
    }).toPass({ timeout: 10_000 })
    return result
  }
  async createEntry(input = this.receiptInput()) {
    const created = await this.api.create('/inventory-bc/v1/stock-entries', input)
    return this.visible('stock-entries', created.id)
  }
  async createAdjustment(lotId: string, countedQty: number) {
    const created = await this.api.create('/inventory-bc/v1/stock-adjustments', this.adjustmentInput(lotId, countedQty))
    return this.visible('stock-adjustments', created.id)
  }
  async action(resource: StockResource, id: string, action: 'submit' | 'approve' | 'cancel') {
    const json = await this.api.post<{ data: { id: string; attributes: Omit<StockDocument, 'id'> } }>(
      `/inventory-bc/v1/${resource}/${id}/${action}`,
      action === 'cancel' ? { cancel_reason: `${this.marker} จบทดสอบ` } : {},
    )
    return { id: json.data.id, ...json.data.attributes }
  }
  async receipt(qty = 10, cost = 1, productId = this.productId) {
    const doc = await this.createEntry(this.receiptInput(qty, cost, productId))
    return this.action('stock-entries', doc.id, 'submit')
  }
  async lots() {
    const rows = await Promise.all(
      [this.productId, this.secondProductId].map((productId) =>
        this.api.list<StockLot>('/inventory-bc/v1/lots', {
          filter: `product_id||$eq||${productId}`,
          ignore_limit: 'true',
        }),
      ),
    )
    return rows.flat().sort((a, b) => a.id.localeCompare(b.id))
  }
  async movements() {
    const rows = await Promise.all(
      [this.productId, this.secondProductId].map((product_id) =>
        this.api.list<StockMovement>('/inventory-bc/v1/stock-ledger-entries', { product_id, limit: 2000 }),
      ),
    )
    return rows.flat().sort((a, b) => a.id.localeCompare(b.id))
  }
  async quantity(productId = this.productId, warehouseId = this.warehouseId) {
    const rows = await this.api.list<{ total_qty: number }>('/inventory-bc/v1/stock-balances', {
      product_id: productId,
      warehouse_id: warehouseId,
      include_zero_qty: 'true',
      limit: 2000,
    })
    return rows.reduce((sum, row) => sum + Number(row.total_qty), 0)
  }
  async snapshot() {
    const lots = (await this.lots())
      .map(({ id, product_id, warehouse_id, available_qty, received_qty, import_cost }) => ({
        id,
        product_id,
        warehouse_id,
        available_qty,
        received_qty,
        import_cost,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
    return {
      lots,
      movements: (await this.movements()).map(
        ({ id, type, lot_id, product_id, warehouse_id, qty, unit_cost, source_doc_type, source_doc_id }) => ({
          id,
          type,
          lot_id,
          product_id,
          warehouse_id,
          qty,
          unit_cost,
          source_doc_type,
          source_doc_id,
        }),
      ),
      quantities: await Promise.all([
        this.quantity(),
        this.quantity(this.productId, this.destinationWarehouseId),
        this.quantity(this.secondProductId),
      ]),
    }
  }
  async cleanup() {
    const errors: unknown[] = []
    const attempt = async (run: () => Promise<void>) => {
      try {
        await run()
      } catch (error) {
        errors.push(error)
      }
    }
    await attempt(async () => {
      const rows = (
        await Promise.all(
          (['stock-entries', 'stock-adjustments'] as const).map(async (resource) =>
            (
              await this.api.list<StockDocument>(`/inventory-bc/v1/${resource}`, {
                filter: `remark_th||$starts||${this.marker}`,
                ignore_limit: 'true',
              })
            ).map((record) => ({ resource, record })),
          ),
        )
      )
        .flat()
        .sort((a, b) => stockPostingTime(b.record) - stockPostingTime(a.record))
      for (const { resource, record } of rows)
        await attempt(async () => {
          if (!record.remark?.th?.startsWith(this.marker)) throw new Error('Unowned stock document')
          const action = stockCleanupAction(record)
          if (action === 'delete') await this.api.delete(`/inventory-bc/v1/${resource}/${record.id}`)
          else if (action !== 'retain') {
            // Pending cancellation is verified separately; approval then reversal is owned-stock-only cleanup.
            if (action === 'approve-cancel') await this.action(resource, record.id, 'approve')
            await this.action(resource, record.id, 'cancel')
            await expect
              .poll(async () => (await this.read(resource, record.id)).status, { timeout: 10_000 })
              .toBe('CANCELLED')
          }
        })
    })
    await attempt(async () => {
      if (!this.secondProductId) return
      const product = await this.api.get<{ data: { attributes: { sku: string } } }>(
        `/inventory-bc/v1/products/${this.secondProductId}`,
      )
      if (!product.data.attributes.sku.startsWith('E2E-')) throw new Error('Unowned repack product')
      await expect.poll(() => this.inventory.stockQty(this.secondProductId), { timeout: 10_000 }).toBe(0)
      await this.api.delete(`/inventory-bc/v1/products/${this.secondProductId}`)
    })
    await attempt(() => this.inventory.cleanup())
    if (errors.length) throw new AggregateError(errors, 'Stock cleanup failed')
  }
}

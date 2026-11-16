import { expect } from '@playwright/test'
import { buildPurchaseReturn, buildSalesReturn, buildStockEntry, e2eCode } from '@data/factories'
import { PurchasingScenario } from './purchasing-scenario'
import { SalesFulfillmentScenario } from './sales-fulfillment-scenario'
import { type ApiClient } from './api-client'
import { type OwnedStockLotInput } from './owned-sales-stock'
export type ReturnKind = 'purchase' | 'sales'
export type ReturnRecord = {
  id: string
  status: string
  return_reason: string
  remark?: { th?: string }
  grn_id?: string
  dn_id?: string
  po_id?: string
  so_id?: string
  prn_number?: string
  srn_number?: string
  po_synced_at?: string | null
  items: {
    id: string
    qty: number
    grn_item_id?: string
    dn_item_id?: string
    lot_id?: string
    po_item_id?: string
    so_item_id?: string
    product_id: string
    unit_cost?: number
    unit_price?: number
    line_total: number
    qty_entered?: number
    conversion_factor?: number
  }[]
}
type Source = {
  id: string
  status: string
  grn_number?: string
  dn_number?: string
  items: { id: string; lot_id?: string; product_id: string; qty: number }[]
}
export class ReturnScenario {
  readonly marker = e2eCode('RETURN')
  readonly inventory: PurchasingScenario
  readonly fulfillment?: SalesFulfillmentScenario
  source!: Source
  orderId = ''
  constructor(
    readonly api: ApiClient,
    readonly kind: ReturnKind,
    readonly qty = 4,
    readonly cost = 40,
    lots?: readonly OwnedStockLotInput[],
  ) {
    if (kind === 'sales') {
      this.fulfillment = new SalesFulfillmentScenario(api, lots ?? [{ qty, unitCost: cost }])
      this.inventory = this.fulfillment.stock.inventory
    } else this.inventory = new PurchasingScenario(api)
  }
  get originalCost() {
    return this.fulfillment
      ? this.fulfillment.stock.lots.reduce((sum, lot) => sum + lot.qty * lot.unitCost, 0)
      : this.qty * this.cost
  }
  get resource() {
    return this.kind === 'purchase' ? 'purchase-returns' : 'sales-returns'
  }
  get prefix() {
    return this.kind === 'purchase' ? 'inventory-bc' : 'sales-bc'
  }
  get path() {
    return `/${this.prefix}/v1/${this.resource}`
  }
  get productId() {
    return this.inventory.productId
  }
  get warehouseId() {
    return this.inventory.warehouseId
  }
  async seed(submitSource = true) {
    if (this.fulfillment) {
      await this.fulfillment.seed()
      const order = await this.fulfillment.newOrder(this.qty)
      this.orderId = order.id
      const draft = await this.fulfillment.draft(order, this.qty)
      this.source = draft
      if (submitSource) await this.api.post(`/sales-bc/v1/delivery-notes/${draft.id}/submit`, {})
      await expect(async () => {
        this.source = { id: draft.id, ...(await this.fulfillment!.note(draft.id)) }
        expect(this.source.status).toBe(submitSource ? 'SUBMITTED' : 'DRAFT')
      }).toPass({ timeout: 10_000 })
      await expect.poll(() => this.inventory.stockQty(), { timeout: 10_000 }).toBe(submitSource ? 0 : this.qty)
      await expect
        .poll(async () => (await this.fulfillment!.costs()).reduce((sum, row) => sum + row.cogs, 0), {
          timeout: 10_000,
        })
        .toBe(submitSource ? this.originalCost : 0)
    } else {
      await this.inventory.seed()
      const order = await this.inventory.createOrder(true, {
        items: [
          { product_id: this.productId, qty: this.qty, unit_cost: this.cost, discount_type: 'amount', discount: 0 },
        ],
      })
      this.orderId = order.id
      const input = this.inventory.receiptInput(order)
      input.items[0]!.qty = this.qty
      input.items[0]!.import_cost = this.cost
      const created = await this.api.create<Omit<Source, 'id'>>('/inventory-bc/v1/goods-receipts', input)
      if (submitSource) {
        const submitted = await this.api.post<{ data: { attributes: Omit<Source, 'id'> } }>(
          `/inventory-bc/v1/goods-receipts/${created.id}/submit`,
          {},
        )
        this.source = { id: created.id, ...submitted.data.attributes }
      } else this.source = created
      await expect.poll(() => this.inventory.stockQty(), { timeout: 10_000 }).toBe(submitSource ? this.qty : 0)
    }
  }
  input(qty = 1) {
    const overrides = { return_reason: `${this.marker} สินค้าชำรุดจากการขนส่ง`, remark_th: `${this.marker} คืนอุปกรณ์สำนักงาน` }
    return this.kind === 'purchase'
      ? buildPurchaseReturn(
          { grn_id: this.source.id, grn_item_id: this.source.items[0]!.id },
          { ...overrides, items: [{ grn_item_id: this.source.items[0]!.id, qty }] },
        )
      : buildSalesReturn(
          { dn_id: this.source.id, dn_item_id: this.source.items[0]!.id },
          { ...overrides, items: [{ dn_item_id: this.source.items[0]!.id, qty }] },
        )
  }
  async read(id: string) {
    const json = await this.api.get<{ data: { id: string; attributes: Omit<ReturnRecord, 'id'> } }>(
      `${this.path}/${id}`,
      { relations: 'items' },
    )
    return { id: json.data.id, ...json.data.attributes }
  }
  async create(qty = 1) {
    const created = await this.api.create(this.path, this.input(qty))
    let record!: ReturnRecord
    await expect(async () => {
      record = await this.read(created.id)
      expect(record.id).toBe(created.id)
      expect(record.items).toHaveLength(1)
    }).toPass({ timeout: 10_000 })
    return record
  }
  async action(id: string, action: 'submit' | 'cancel' | 'sync-purchase-order') {
    const json = await this.api.post<{ data: { id: string; attributes: Omit<ReturnRecord, 'id'> } }>(
      `${this.path}/${id}/${action}`,
      action === 'cancel' ? { cancel_reason: `${this.marker} ย้อนหลังทดสอบ` } : {},
    )
    return { id: json.data.id, ...json.data.attributes }
  }
  async issues() {
    return this.api.list<{ status: string; remark: { th: string }; created_at: string }>(
      '/inventory-bc/v1/stock-entries',
      { filter: `remark_th||$starts||${this.marker}`, ignore_limit: 'true', sort: 'created_at:DESC' },
    )
  }
  async issue(qty = 1) {
    const input = buildStockEntry({
      entry_type: 'MATERIAL_ISSUE',
      from_warehouse_id: this.warehouseId,
      remark_th: `${this.marker} เบิกทดสอบ guard`,
      items: [{ product_id: this.productId, qty }],
    })
    const created = await this.api.create('/inventory-bc/v1/stock-entries', input)
    await this.api.post(`/inventory-bc/v1/stock-entries/${created.id}/submit`, {})
    return created
  }
  async lots() {
    return this.api.list<{
      product_id: string
      warehouse_id: string
      lot_number: string
      available_qty: number
      received_qty: number
      import_cost: number
    }>('/inventory-bc/v1/lots', { filter: `product_id||$eq||${this.productId}`, ignore_limit: 'true', sort: 'id:ASC' })
  }
  async movements() {
    return this.api.list<{
      type: string
      lot_id: string
      qty: number
      unit_cost: number
      source_doc_type: string
      source_doc_id: string
    }>('/inventory-bc/v1/stock-ledger-entries', { product_id: this.productId, limit: 2000 })
  }
  async order() {
    return this.fulfillment ? this.fulfillment.order(this.orderId) : this.inventory.readOrder(this.orderId)
  }
  async snapshot() {
    const order = await this.order()
    return {
      status: order.status,
      lines: order.items!.map(
        ({
          id,
          qty,
          received_qty,
          delivered_qty,
          returned_qty,
        }: {
          id: string
          qty: number
          received_qty?: number
          delivered_qty?: number
          returned_qty?: number
        }) => ({ id, qty, received_qty, delivered_qty, returned_qty }),
      ),
      qty: await this.inventory.stockQty(),
      lots: (await this.lots()).map(({ id, available_qty, received_qty, import_cost }) => ({
        id,
        available_qty,
        received_qty,
        import_cost,
      })),
      ledger: (await this.movements()).map(({ id, type, lot_id, qty, unit_cost, source_doc_type, source_doc_id }) => ({
        id,
        type,
        lot_id,
        qty,
        unit_cost,
        source_doc_type,
        source_doc_id,
      })),
      cogs: this.fulfillment
        ? (await this.fulfillment.costs()).map(({ id, lot_id, qty, unit_cost, cogs }) => ({
            id,
            lot_id,
            qty,
            unit_cost,
            cogs,
          }))
        : [],
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
      for (const issue of await this.issues()) {
        if (!issue.remark?.th?.startsWith(this.marker)) throw new Error('Unowned return-guard issue')
        await attempt(async () => {
          if (issue.status === 'DRAFT') await this.api.delete(`/inventory-bc/v1/stock-entries/${issue.id}`)
          else if (issue.status === 'SUBMITTED')
            await this.api.post(`/inventory-bc/v1/stock-entries/${issue.id}/cancel`, {
              cancel_reason: `${this.marker} คืนยอดเบิก`,
            })
        })
      }
    })
    await attempt(async () => {
      const records = await this.api.list<ReturnRecord>(this.path, {
        filter: `return_reason||$starts||${this.marker}`,
        ignore_limit: 'true',
        sort: 'created_at:DESC',
      })
      for (const record of records)
        await attempt(async () => {
          if (!record.return_reason.startsWith(this.marker) || (record.grn_id ?? record.dn_id) !== this.source.id)
            throw new Error('Unowned return')
          if (record.status === 'DRAFT') await this.api.delete(`${this.path}/${record.id}`)
          else if (record.status === 'SUBMITTED') await this.action(record.id, 'cancel')
        })
      if (this.source && this.kind === 'purchase')
        await expect
          .poll(async () => (await this.inventory.readOrder(this.orderId)).items[0]!.returned_qty, { timeout: 10_000 })
          .toBe(0)
    })
    if (this.fulfillment && this.source)
      await attempt(async () => {
        const note = await this.fulfillment!.note(this.source.id)
        if (note.status === 'SUBMITTED')
          await expect
            .poll(async () => (await this.fulfillment!.costs()).reduce((sum, row) => sum + row.cogs, 0), {
              timeout: 10_000,
            })
            .toBe(this.originalCost)
      })
    await attempt(() => (this.fulfillment ? this.fulfillment.cleanup() : this.inventory.cleanup()))
    if (this.fulfillment && this.source)
      await attempt(async () => {
        await expect.poll(async () => (await this.fulfillment!.costs()).length, { timeout: 10_000 }).toBe(0)
      })
    if (errors.length) throw new AggregateError(errors, 'Return cleanup failed')
  }
}

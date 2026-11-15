import { expect } from '@playwright/test'
import { type ApiClient } from './api-client'
import { OwnedSalesStock, type OwnedStockLotInput } from './owned-sales-stock'
import { SalesScenario, type SalesRecord } from './sales-scenario'
import { buildQuotation } from '@data/factories'

export type FulfillmentOrder = Omit<SalesRecord, 'items'> & {
  quotation_id: string
  customer_id: string
  so_number: string
  total: number
  items: {
    id: string
    product_id: string
    qty: number
    delivered_qty: number
    returned_qty: number
    unit_price: number
    line_total: number
  }[]
}
export type FulfillmentNote = Omit<SalesRecord, 'items'> & {
  dn_number: string
  so_id: string
  items: { id: string; product_id: string; so_item_id: string; qty: number }[]
}
export type CostEntry = {
  sale_id: string
  product_id: string
  lot_id: string
  qty: number
  unit_cost: number
  cogs: number
}
export type ProfitEntry = {
  sale_id: string
  product_id: string
  customer_id: string
  lot_id: string
  cogs: number
  revenue: number
  gross_profit: number
}

/** Owned chain only; reverse all attempted delivery stock cuts before parent/GR cleanup. */
export class SalesFulfillmentScenario {
  readonly stock: OwnedSalesStock
  readonly sales: SalesScenario
  private readonly notes = new Set<string>()
  constructor(
    readonly api: ApiClient,
    lots?: readonly OwnedStockLotInput[],
  ) {
    this.stock = new OwnedSalesStock(api, lots)
    this.sales = new SalesScenario(api, this.stock)
  }
  async seed() {
    await this.sales.seed()
  }
  trackNote(id: string) {
    this.notes.add(id)
  }
  async order(id: string) {
    return (
      await this.api.get<{ data: { attributes: FulfillmentOrder } }>(`/sales-bc/v1/sales-orders/${id}`, {
        relations: 'items',
      })
    ).data.attributes
  }
  async note(id: string) {
    return (
      await this.api.get<{ data: { attributes: FulfillmentNote } }>(`/sales-bc/v1/delivery-notes/${id}`, {
        relations: 'items',
      })
    ).data.attributes
  }
  async costs() {
    return this.api.list<CostEntry>('/finance-bc/v1/cogs-entries', {
      filter: `product_id||$eq||${this.sales.productId}`,
      ignore_limit: 'true',
    })
  }
  async profits() {
    return this.api.list<ProfitEntry>('/finance-bc/v1/profit-loss-records', {
      filter: `product_id||$eq||${this.sales.productId}`,
      ignore_limit: 'true',
    })
  }
  async approvedQuotation(qty: number, unitPrice = 150, discount = 0) {
    const input = buildQuotation(
      { customer_id: this.sales.customerId, product_id: this.sales.productId },
      {
        remark_th: `${this.sales.marker} เสนอราคาอุปกรณ์สำนักงาน`,
        discount_mode: discount ? 'per_item' : 'none',
        items: [{ product_id: this.sales.productId, qty, unit_price: unitPrice, discount_type: 'amount', discount }],
      },
    )
    const quote = await this.api.create<SalesRecord>('/sales-bc/v1/quotations', input)
    await this.api.post(`/sales-bc/v1/quotations/${quote.id}/send`, {})
    await this.api.post(`/sales-bc/v1/quotations/${quote.id}/approve`, {})
    return quote
  }
  async newOrder(qty: number, unitPrice = 150, discount = 0) {
    const quote = await this.approvedQuotation(qty, unitPrice, discount)
    const converted = await this.api.post<{ data: { id: string } }>(
      `/sales-bc/v1/quotations/${quote.id}/convert-to-sales-order`,
      {},
    )
    return { id: converted.data.id, ...(await this.order(converted.data.id)) }
  }
  async draft(order: { id: string; items?: { id: string }[] }, qty: number) {
    const input = this.sales.deliveryInput(order)
    input.items[0]!.qty = qty
    const created = await this.api.create<FulfillmentNote>('/sales-bc/v1/delivery-notes', input)
    this.trackNote(created.id)
    return created
  }
  async lots() {
    return this.api.list<{
      available_qty: number
      received_qty: number
      import_cost: number
      expiry_date: string | null
    }>('/inventory-bc/v1/lots', { filter: `product_id||$eq||${this.sales.productId}`, ignore_limit: 'true' })
  }
  async movements() {
    return this.api.list<{
      type: string
      qty: number
      lot_id: string
      source_doc_id: string
      source_doc_number: string | null
      unit_cost: number
    }>('/inventory-bc/v1/stock-ledger-entries', { product_id: this.sales.productId, limit: 100 })
  }
  async journals(saleId: string) {
    return this.api.list<{
      journal_id: string
      account_id: string
      ref_doc_type: string
      ref_doc_id: string
      debit: number
      credit: number
      is_cancelled: boolean
    }>('/finance-bc/v1/ledger-entries', { filter: `ref_doc_id||$eq||${saleId}`, ignore_limit: 'true' })
  }
  async businessSnapshot(orderId: string) {
    const [order, stock, lots, movements, costs, profits] = await Promise.all([
      this.order(orderId),
      this.stock.inventory.stockQty(),
      this.lots(),
      this.movements(),
      this.costs(),
      this.profits(),
    ])
    return {
      order: {
        status: order.status,
        total: order.total,
        items: order.items.map(({ id, product_id, qty, delivered_qty, returned_qty, line_total }) => ({
          id,
          product_id,
          qty,
          delivered_qty,
          returned_qty,
          line_total,
        })),
      },
      stock,
      lots: lots.map(({ id, available_qty, import_cost }) => ({ id, available_qty, import_cost })),
      movements: movements.map(({ id, type, qty, lot_id, source_doc_id }) => ({
        id,
        type,
        qty,
        lot_id,
        source_doc_id,
      })),
      costs: costs.map(({ id, sale_id, lot_id, qty, cogs }) => ({ id, sale_id, lot_id, qty, cogs })),
      profits: profits.map(({ id, sale_id, lot_id, revenue, cogs, gross_profit }) => ({
        id,
        sale_id,
        lot_id,
        revenue,
        cogs,
        gross_profit,
      })),
    }
  }
  async cleanup() {
    const failures: unknown[] = []
    for (const id of this.notes) {
      try {
        const note = await this.note(id)
        if (!note.remark?.th?.startsWith(this.sales.marker)) throw new Error('Refusing cleanup of unowned delivery')
        if (['DRAFT', 'PENDING_APPROVAL', 'SUBMITTED'].includes(note.status))
          await this.api.post(`/sales-bc/v1/delivery-notes/${id}/cancel`, {
            cancel_reason: `${this.sales.marker} จบการทดสอบจัดส่ง`,
          })
        await expect.poll(async () => (await this.note(id)).status).toBe('CANCELLED')
      } catch (error) {
        failures.push(error)
      }
    }
    try {
      await this.sales.cleanup()
    } catch (error) {
      failures.push(error)
    }
    if (failures.length) throw new AggregateError(failures, 'Fulfillment cleanup failed')
  }
}

import { buildCustomer, buildDeliveryNote, buildQuotation, e2eCode } from '@data/factories'
import { salesCleanupAction, type SalesResource } from '@data/sales-cleanup'
import { type ApiClient } from './api-client'

type SalesRecord = {
  status: string
  remark?: { th?: string }
  quotation_number?: string
  so_number?: string
  dn_number?: string
  sales_order_id?: string | null
  items?: { id: string; product_id: string; qty: number; delivered_qty?: number }[]
}

/** Owns a customer and document marker. Catalogue/stock are read-only references; no stock is posted. */
export class SalesScenario {
  readonly marker = e2eCode('SALE')
  readonly customer = buildCustomer({ customer_type: 'company', credit_limit: 1_000_000 })
  customerId = ''
  productId = ''
  sku = ''
  warehouseId = ''
  warehouseName = ''
  constructor(readonly api: ApiClient) {}

  async seed() {
    const balances = await this.api.list<{
      product_id: string
      warehouse_id?: string
      product_sku?: string
      total_qty?: number
      expired_qty?: number
    }>('/inventory-bc/v1/stock-balances', { limit: 100 })
    const stocked = balances.find(
      (row) =>
        Number(row.total_qty) - Number(row.expired_qty ?? 0) >= 2 &&
        row.warehouse_id &&
        row.product_sku &&
        !row.product_sku.startsWith('E2E-'),
    )
    if (!stocked)
      throw new Error(
        'Sales fixture needs an existing catalogue product with at least 2 available units and a warehouse ID',
      )
    this.productId = stocked.product_id
    this.sku = stocked.product_sku!
    this.warehouseId = stocked.warehouse_id!
    const warehouse = await this.api.get<{ data: { attributes: { name: { th: string } } } }>(
      `/inventory-bc/v1/warehouses/${this.warehouseId}`,
    )
    this.warehouseName = warehouse.data.attributes.name.th
    const created = await this.api.create('/sales-bc/v1/customers', this.customer)
    this.customerId = created.id
  }
  quotationInput() {
    return buildQuotation(
      { customer_id: this.customerId, product_id: this.productId },
      { remark_th: `${this.marker} เสนอราคาสินค้าสำนักงาน` },
    )
  }
  async createQuotation() {
    return this.api.create<SalesRecord>('/sales-bc/v1/quotations', this.quotationInput())
  }
  async createOrder() {
    const quote = await this.createQuotation()
    await this.api.post(`/sales-bc/v1/quotations/${quote.id}/send`, {})
    await this.api.post(`/sales-bc/v1/quotations/${quote.id}/approve`, {})
    let json = await this.api.post<{ data: { id: string; attributes: SalesRecord } }>(
      `/sales-bc/v1/quotations/${quote.id}/convert-to-sales-order`,
      {},
    )
    if (json.data.attributes.status === 'PENDING_APPROVAL')
      json = await this.api.post<{ data: { id: string; attributes: SalesRecord } }>(
        `/sales-bc/v1/sales-orders/${json.data.id}/approve`,
        {},
      )
    return { id: json.data.id, ...json.data.attributes }
  }
  deliveryInput(order: { id: string; items?: { id: string }[] }) {
    const first = order.items?.[0]
    if (!first) throw new Error('Converted sales order has no item IDs')
    return buildDeliveryNote(
      { so_id: order.id, warehouse_id: this.warehouseId, so_item_id: first.id },
      { remark_th: `${this.marker} จัดส่งสินค้าสำนักงาน` },
    )
  }
  private async cleanupDocument(resource: SalesResource, record: SalesRecord & { id: string }) {
    if (!record.remark?.th?.startsWith(this.marker)) throw new Error(`Refusing cleanup of unowned ${resource}`)
    const action = salesCleanupAction(resource, record)
    const path = `/sales-bc/v1/${resource}/${record.id}`
    if (action === 'delete') await this.api.delete(path)
    else if (action === 'cancel') await this.api.post(`${path}/cancel`, { cancel_reason: `${this.marker} จบการทดสอบ` })
    else if (record.status !== 'CANCELLED')
      console.info(`Retained owned ${resource} ${record.id}: status=${record.status}`)
  }

  async cleanup() {
    const failures: unknown[] = []
    const attempt = async (run: () => Promise<void>) => {
      try {
        await run()
      } catch (error) {
        failures.push(error)
      }
    }
    // Attempt customer cleanup even when a document query/action fails. Report every failure afterwards.
    await attempt(async () => {
      const quotes = await this.api.list<SalesRecord>('/sales-bc/v1/quotations', {
        filter: `remark_th||$starts||${this.marker}`,
        ignore_limit: 'true',
      })
      for (const quote of quotes) {
        if (!quote.remark?.th?.startsWith(this.marker)) continue
        const orders = await this.api.list<SalesRecord>('/sales-bc/v1/sales-orders', {
          filter: `quotation_id||$eq||${quote.id}`,
          ignore_limit: 'true',
          relations: 'items',
        })
        for (const order of orders) {
          const notes = await this.api.list<SalesRecord>('/sales-bc/v1/delivery-notes', {
            filter: `so_id||$eq||${order.id}`,
            ignore_limit: 'true',
          })
          for (const note of notes) await attempt(() => this.cleanupDocument('delivery-notes', note))
          await attempt(() => this.cleanupDocument('sales-orders', order))
        }
        // SO cancellation clears quotation.sales_order_id. Do not act on the pre-cancellation snapshot.
        await attempt(async () => {
          const fresh = await this.api.get<{ data: { id: string; attributes: SalesRecord } }>(
            `/sales-bc/v1/quotations/${quote.id}`,
          )
          await this.cleanupDocument('quotations', { id: fresh.data.id, ...fresh.data.attributes })
        })
      }
    })
    await attempt(async () => {
      const customers = await this.api.list<{ code: string }>('/sales-bc/v1/customers', {
        filter: `code||$eq||${this.customer.code}`,
      })
      for (const customer of customers)
        if (customer.code === this.customer.code) await this.api.delete(`/sales-bc/v1/customers/${customer.id}`)
    })
    if (failures.length) throw new AggregateError(failures, `Sales cleanup failed (${failures.length} operation(s))`)
  }
}

import { buildCustomer, buildDeliveryNote, buildQuotation, e2eCode } from '@data/factories'
import { type ApiClient } from './api-client'

type SalesRecord = {
  status: string
  remark?: { th?: string }
  quotation_number?: string
  so_number?: string
  dn_number?: string
  sales_order_id?: string | null
  items?: { id: string; product_id: string; qty: number }[]
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
        row.product_sku &&
        !row.product_sku.startsWith('E2E-'),
    )
    if (!stocked) throw new Error('Sales fixture needs an existing catalogue product with at least 2 available units')
    this.productId = stocked.product_id
    this.sku = stocked.product_sku!
    this.warehouseId =
      stocked.warehouse_id ??
      (await this.api.firstId('/inventory-bc/v1/warehouses', { filter: 'is_group||$eq||false' }))
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
    const json = await this.api.post<{ data: { id: string; attributes: SalesRecord } }>(
      `/sales-bc/v1/quotations/${quote.id}/convert-to-sales-order`,
      {},
    )
    if (json.data.attributes.status === 'PENDING_APPROVAL')
      await this.api.post(`/sales-bc/v1/sales-orders/${json.data.id}/approve`, {})
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
  async cleanup() {
    // Discover partial UI success by owned remark, including failed multi-request SO creation.
    const quotes = await this.api.list<SalesRecord>('/sales-bc/v1/quotations', {
      filter: `remark_th||$starts||${this.marker}`,
      ignore_limit: 'true',
    })
    for (const quote of quotes) {
      if (!quote.remark?.th?.startsWith(this.marker)) continue
      const orders = await this.api.list<SalesRecord>('/sales-bc/v1/sales-orders', {
        filter: `quotation_id||$eq||${quote.id}`,
        ignore_limit: 'true',
      })
      for (const order of orders) {
        const notes = await this.api.list<SalesRecord>('/sales-bc/v1/delivery-notes', {
          filter: `so_id||$eq||${order.id}`,
          ignore_limit: 'true',
        })
        for (const note of notes) {
          if (!note.remark?.th?.startsWith(this.marker)) throw new Error('Refusing cleanup of an unowned delivery note')
          if (note.status === 'DRAFT') await this.api.delete(`/sales-bc/v1/delivery-notes/${note.id}`)
          else if (note.status !== 'CANCELLED')
            await this.api.post(`/sales-bc/v1/delivery-notes/${note.id}/cancel`, {
              cancel_reason: `${this.marker} จบการทดสอบ`,
            })
        }
        if (order.status !== 'CANCELLED')
          await this.api.post(`/sales-bc/v1/sales-orders/${order.id}/cancel`, {
            cancel_reason: `${this.marker} จบการทดสอบ`,
          })
      }
      if (quote.status === 'DRAFT') await this.api.delete(`/sales-bc/v1/quotations/${quote.id}`)
      else if (quote.status !== 'CANCELLED')
        await this.api.post(`/sales-bc/v1/quotations/${quote.id}/cancel`, {
          cancel_reason: `${this.marker} จบการทดสอบ`,
        })
    }
    const customers = await this.api.list<{ code: string }>('/sales-bc/v1/customers', {
      filter: `code||$eq||${this.customer.code}`,
    })
    for (const customer of customers)
      if (customer.code === this.customer.code) await this.api.delete(`/sales-bc/v1/customers/${customer.id}`)
  }
}

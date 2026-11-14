import { buildGoodsReceipt, buildProduct, buildPurchaseOrder, buildSupplier, e2eCode } from '@data/factories'
import { purchasingCleanupAction } from '@data/purchasing-cleanup'
import { type ApiClient } from './api-client'

export type PurchaseRecord = {
  status: string
  po_number?: string
  grn_number?: string
  po_id?: string
  remark?: { th?: string }
  items?: { id: string; product_id: string; qty: number; received_qty?: number; returned_qty?: number }[]
}
export class PurchasingScenario {
  readonly marker = e2eCode('PUR')
  readonly supplier = buildSupplier({ supplier_type: 'company', billing_currency: 'THB' })
  supplierId = ''
  productId = ''
  sku = ''
  productName = ''
  warehouseId = ''
  warehouseName = ''
  warehouseCode = ''
  constructor(readonly api: ApiClient) {}

  async seed() {
    const groupId = await this.api.firstId('/inventory-bc/v1/item-groups', { filter: 'is_group||$eq||false' })
    const uomId = await this.api.firstId('/inventory-bc/v1/uoms')
    const warehouses = await this.api.list<{ name: { th: string }; code?: string; warehouse_type: string }>(
      '/inventory-bc/v1/warehouses',
      { filter: 'is_group||$eq||false', limit: 100 },
    )
    const warehouse = warehouses.find((row) => row.warehouse_type === 'stock' && !row.code?.startsWith('E2E-'))
    if (!warehouse) throw new Error('Purchasing fixture needs an existing leaf warehouse')
    this.warehouseId = warehouse.id
    this.warehouseName = warehouse.name.th
    this.warehouseCode = warehouse.code ?? ''
    const supplier = await this.api.create('/supplier-bc/v1/suppliers', this.supplier)
    this.supplierId = supplier.id
    const input = buildProduct({ item_group_id: groupId, stock_uom_id: uomId })
    this.sku = input.sku!
    this.productName = input.name_th
    const product = await this.api.create('/inventory-bc/v1/products', input)
    this.productId = product.id
  }
  get createWarehouseLabel() {
    return this.warehouseCode ? `[${this.warehouseCode}] ${this.warehouseName}` : this.warehouseName
  }
  get receiptWarehouseLabel() {
    return this.warehouseCode ? `${this.warehouseName} (${this.warehouseCode})` : this.warehouseName
  }
  orderInput() {
    return buildPurchaseOrder(
      { supplier_id: this.supplierId, product_id: this.productId },
      { remark_th: `${this.marker} จัดซื้ออุปกรณ์สำนักงาน` },
    )
  }
  async createOrder(sent = false) {
    let order = await this.api.create<PurchaseRecord>('/supplier-bc/v1/purchase-orders', this.orderInput())
    if (sent) {
      for (const action of ['approve', 'send']) {
        const json = await this.api.post<{ data: { id: string; attributes: PurchaseRecord } }>(
          `/supplier-bc/v1/purchase-orders/${order.id}/${action}`,
          {},
        )
        order = { id: json.data.id, ...json.data.attributes }
      }
    }
    return order
  }
  receiptInput(order: { id: string; items?: { id: string }[] }) {
    if (!order.items?.[0]) throw new Error('PO has no line IDs')
    return buildGoodsReceipt(
      { po_id: order.id, warehouse_id: this.warehouseId, product_id: this.productId, po_item_id: order.items[0].id },
      { remark_th: `${this.marker} รับอุปกรณ์เข้าคลัง` },
    )
  }
  async cancelReceipt(id: string) {
    const json = await this.api.post<{ data: { id: string; attributes: PurchaseRecord } }>(
      `/inventory-bc/v1/goods-receipts/${id}/cancel`,
      { cancel_reason: `${this.marker} คืนยอดหลังทดสอบ` },
    )
    return { id: json.data.id, ...json.data.attributes }
  }
  async stockQty(productId = this.productId) {
    const rows = await this.api.list<{ total_qty: number }>('/inventory-bc/v1/stock-balances', {
      product_id: productId,
      limit: 100,
      include_zero_qty: 'true',
    })
    return rows.reduce((sum, row) => sum + Number(row.total_qty), 0)
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
      const receipts = await this.api.list<PurchaseRecord>('/inventory-bc/v1/goods-receipts', {
        filter: `remark_th||$starts||${this.marker}`,
        ignore_limit: 'true',
      })
      for (const receipt of receipts) {
        if (!receipt.remark?.th?.startsWith(this.marker)) throw new Error('Unowned receipt')
        await attempt(async () => {
          const path = `/inventory-bc/v1/goods-receipts/${receipt.id}`
          if (purchasingCleanupAction('goods-receipts', receipt) === 'delete') await this.api.delete(path)
          else if (purchasingCleanupAction('goods-receipts', receipt) === 'cancel')
            await this.api.post(`${path}/cancel`, { cancel_reason: `${this.marker} จบการทดสอบ` })
          else if (receipt.status !== 'CANCELLED') console.info(`Retained owned GR ${receipt.id}: ${receipt.status}`)
        })
      }
      const orders = await this.api.list<PurchaseRecord>('/supplier-bc/v1/purchase-orders', {
        filter: `remark_th||$starts||${this.marker}`,
        ignore_limit: 'true',
        relations: 'items',
      })
      for (const order of orders) {
        if (!order.remark?.th?.startsWith(this.marker)) throw new Error('Unowned order')
        await attempt(async () => {
          const path = `/supplier-bc/v1/purchase-orders/${order.id}`
          if (purchasingCleanupAction('purchase-orders', order) === 'delete') await this.api.delete(path)
          else if (purchasingCleanupAction('purchase-orders', order) === 'cancel')
            await this.api.post(`${path}/cancel`, { cancel_reason: `${this.marker} จบการทดสอบ` })
          else if (order.status !== 'CANCELLED') console.info(`Retained owned PO ${order.id}: ${order.status}`)
        })
      }
    })
    await attempt(async () => {
      if (!this.sku.startsWith('E2E-')) return
      const products = await this.api.list<{ sku: string }>('/inventory-bc/v1/products', {
        filter: `sku||$eq||${this.sku}`,
        ignore_limit: 'true',
      })
      for (const product of products) {
        if (product.sku !== this.sku) throw new Error('Unowned product')
        if ((await this.stockQty(product.id)) !== 0)
          throw new Error('Owned purchasing stock was not reversed; refusing product deletion')
        await this.api.delete(`/inventory-bc/v1/products/${product.id}`)
      }
    })
    await attempt(async () => {
      const suppliers = await this.api.list<{ code: string }>('/supplier-bc/v1/suppliers', {
        filter: `code||$eq||${this.supplier.code}`,
        ignore_limit: 'true',
      })
      for (const supplier of suppliers) {
        if (supplier.code !== this.supplier.code || !supplier.code.startsWith('E2E-'))
          throw new Error('Unowned supplier')
        await this.api.delete(`/supplier-bc/v1/suppliers/${supplier.id}`)
      }
    })
    if (errors.length) throw new AggregateError(errors, 'Purchasing cleanup failed')
  }
}

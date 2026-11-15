import { e2eCode } from './ids'

export type PurchaseOrderInput = {
  supplier_id: string
  document_type: 'STANDARD_PO' | 'BLANKET_PO' | 'PLANNED_PO' | 'CONTRACT_PO'
  document_date: string
  expected_date: string
  remark_th: string
  items: { product_id: string; qty: number; unit_cost: number; discount_type: 'amount' | 'percent'; discount: number }[]
}
export const buildPurchaseOrder = (
  refs: { supplier_id: string; product_id: string },
  overrides: Partial<PurchaseOrderInput> = {},
): PurchaseOrderInput => ({
  supplier_id: refs.supplier_id,
  document_type: 'STANDARD_PO',
  document_date: new Date().toISOString(),
  expected_date: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  remark_th: `${e2eCode('PO')} จัดซื้อเครื่องเขียนสำนักงาน`,
  items: [{ product_id: refs.product_id, qty: 1, unit_cost: 100, discount_type: 'amount', discount: 0 }],
  ...overrides,
})
export type GoodsReceiptInput = {
  po_id: string
  warehouse_id: string
  document_date: string
  remark_th: string
  items: { product_id: string; po_item_id: string; qty: number; import_cost: number; lot_number: string }[]
}
export const buildGoodsReceipt = (
  refs: { po_id: string; warehouse_id: string; product_id: string; po_item_id: string },
  overrides: Partial<GoodsReceiptInput> = {},
): GoodsReceiptInput => ({
  po_id: refs.po_id,
  warehouse_id: refs.warehouse_id,
  document_date: new Date().toISOString(),
  remark_th: `${e2eCode('GR')} รับเครื่องเขียนเข้าคลัง`,
  items: [
    { product_id: refs.product_id, po_item_id: refs.po_item_id, qty: 1, import_cost: 100, lot_number: e2eCode('LOT') },
  ],
  ...overrides,
})

import { e2eCode } from './index'

export type QuotationInput = {
  customer_id: string
  document_type?: 'STANDARD_QUOTATION' | 'REVISED_QUOTATION' | 'COST_ESTIMATE' | 'TENDER_QUOTATION'
  document_date?: string
  valid_until: string
  remark_th: string
  items: {
    product_id: string
    qty: number
    unit_price?: number
    discount_type?: 'amount' | 'percent'
    discount?: number
  }[]
}
export const buildQuotation = (
  refs: { customer_id: string; product_id: string },
  overrides: Partial<QuotationInput> = {},
): QuotationInput => ({
  customer_id: refs.customer_id,
  document_type: 'STANDARD_QUOTATION',
  document_date: new Date().toISOString(),
  valid_until: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  remark_th: `${e2eCode('QT')} เสนอราคาสินค้าสำหรับสำนักงาน`,
  items: [{ product_id: refs.product_id, qty: 1, unit_price: 100, discount_type: 'amount', discount: 0 }],
  ...overrides,
})
export type DeliveryNoteInput = {
  so_id: string
  warehouse_id: string
  document_date?: string
  remark_th: string
  items: { so_item_id: string; qty: number }[]
}
export const buildDeliveryNote = (
  refs: { so_id: string; warehouse_id: string; so_item_id: string },
  overrides: Partial<DeliveryNoteInput> = {},
): DeliveryNoteInput => ({
  so_id: refs.so_id,
  warehouse_id: refs.warehouse_id,
  document_date: new Date().toISOString(),
  remark_th: `${e2eCode('DN')} จัดส่งสินค้าสำนักงาน`,
  items: [{ so_item_id: refs.so_item_id, qty: 1 }],
  ...overrides,
})

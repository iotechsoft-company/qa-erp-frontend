import { e2eCode } from './ids'

export type StockEntryType = 'MATERIAL_RECEIPT' | 'MATERIAL_TRANSFER' | 'MATERIAL_ISSUE' | 'REPACK'
export type StockEntryInput = {
  entry_type: StockEntryType
  from_warehouse_id?: string
  to_warehouse_id?: string
  document_date: string
  remark_th: string
  items: {
    product_id: string
    qty: number
    line_role?: 'SOURCE' | 'DESTINATION'
    source_lot_id?: string
    import_cost?: number
    lot_number?: string
    expiry_date?: string | null
  }[]
}
/** Variants intentionally explicit: server validates each type's warehouse/line shape. */
export const buildStockEntry = (
  overrides: Pick<StockEntryInput, 'entry_type' | 'items'> & Partial<StockEntryInput>,
): StockEntryInput => ({
  document_date: new Date().toISOString(),
  remark_th: `${e2eCode('STE')} รับเบิกและโอนเครื่องเขียน`,
  ...overrides,
})
export type StockAdjustmentInput = {
  warehouse_id: string
  document_date: string
  remark_th: string
  items: { lot_id: string; counted_qty: number }[]
}
export const buildStockAdjustment = (
  refs: Pick<StockAdjustmentInput, 'warehouse_id' | 'items'>,
  overrides: Partial<StockAdjustmentInput> = {},
): StockAdjustmentInput => ({
  document_date: new Date().toISOString(),
  remark_th: `${e2eCode('ADJ')} ตรวจนับเครื่องเขียน`,
  ...refs,
  ...overrides,
})

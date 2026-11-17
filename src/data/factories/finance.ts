import { e2eCode } from './ids'
export type FinanceDiscount = {
  discount_mode: 'none' | 'header' | 'per_item' | 'both'
  discount_type?: 'percent' | 'amount'
  discount_value?: number
}
export type APInvoiceInput = FinanceDiscount & {
  supplier_id: string
  vendor_document_number: string
  document_type: 'VENDOR_BILL' | 'CREDIT_NOTE'
  reference_ap_invoice_id?: string
  document_date: string
  due_date?: string | null
  currency: string
  currency_rate?: number
  currency_date?: string
  wht_config_code?: string | null
  is_vat_included: boolean
  vendor_tax_invoice_type: 'full_tax_invoice' | 'abbreviated_tax_invoice'
  remark_th: string
  items: {
    grn_item_id: string
    qty: number
    unit_cost: number
    discount_type?: 'percent' | 'amount'
    discount?: number
  }[]
}
export type ReceiptInput = FinanceDiscount & {
  document_type:
    | 'RECEIPT'
    | 'INVOICE'
    | 'PROFORMA_INVOICE'
    | 'FULL_TAX_INVOICE'
    | 'INV_TAX_INVOICE'
    | 'ABB_TAX_INVOICE'
    | 'CREDIT_NOTE'
    | 'DEBIT_NOTE'
  reference_receipt_id?: string
  adjustment_reason?: string
  customer_id: string
  delivery_note_id?: string
  document_date: string
  due_date?: string | null
  currency: string
  currency_rate?: number
  currency_date?: string
  wht_config_code?: string | null
  remark_th: string
  items: {
    product_id: string
    dn_item_id?: string
    qty: number
    unit_price: number
    discount_type?: 'percent' | 'amount'
    discount?: number
  }[]
}
export const buildAPInvoice = (
  refs: { supplier_id: string; grn_item_id: string },
  overrides: Partial<APInvoiceInput> = {},
): APInvoiceInput => {
  const marker = e2eCode('AP')
  return {
    supplier_id: refs.supplier_id,
    vendor_document_number: marker,
    document_type: 'VENDOR_BILL',
    document_date: new Date().toISOString(),
    currency: 'THB',
    is_vat_included: false,
    vendor_tax_invoice_type: 'full_tax_invoice',
    discount_mode: 'none',
    remark_th: `${marker} ตั้งหนี้อุปกรณ์สำนักงาน`,
    items: [{ grn_item_id: refs.grn_item_id, qty: 1, unit_cost: 40 }],
    ...overrides,
  }
}
export const buildReceipt = (
  refs: { customer_id: string; product_id: string },
  overrides: Partial<ReceiptInput> = {},
): ReceiptInput => {
  const marker = e2eCode('AR')
  return {
    document_type: 'FULL_TAX_INVOICE',
    customer_id: refs.customer_id,
    document_date: new Date().toISOString(),
    currency: 'THB',
    discount_mode: 'none',
    remark_th: `${marker} เรียกเก็บค่าอุปกรณ์สำนักงาน`,
    items: [{ product_id: refs.product_id, qty: 1, unit_price: 150 }],
    ...overrides,
  }
}

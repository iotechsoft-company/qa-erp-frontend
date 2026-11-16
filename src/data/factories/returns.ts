import { e2eCode } from './ids'
export type PurchaseReturnInput = {
  grn_id: string
  document_date: string
  return_reason: string
  remark_th: string
  items: { grn_item_id: string; qty: number }[]
}
export type SalesReturnInput = {
  dn_id: string
  document_date: string
  return_reason: string
  remark_th: string
  items: { dn_item_id: string; qty: number }[]
}
export const buildPurchaseReturn = (
  refs: { grn_id: string; grn_item_id: string },
  overrides: Partial<PurchaseReturnInput> = {},
): PurchaseReturnInput => {
  const marker = e2eCode('PRN')
  return {
    grn_id: refs.grn_id,
    document_date: new Date().toISOString(),
    return_reason: `${marker} บรรจุภัณฑ์ชำรุดจากขนส่ง`,
    remark_th: `${marker} ส่งคืนอุปกรณ์สำนักงาน`,
    items: [{ grn_item_id: refs.grn_item_id, qty: 1 }],
    ...overrides,
  }
}
export const buildSalesReturn = (
  refs: { dn_id: string; dn_item_id: string },
  overrides: Partial<SalesReturnInput> = {},
): SalesReturnInput => {
  const marker = e2eCode('SRN')
  return {
    dn_id: refs.dn_id,
    document_date: new Date().toISOString(),
    return_reason: `${marker} ลูกค้าคืนอุปกรณ์ชำรุด`,
    remark_th: `${marker} รับคืนอุปกรณ์สำนักงาน`,
    items: [{ dn_item_id: refs.dn_item_id, qty: 1 }],
    ...overrides,
  }
}

import { type ApiClient } from '@api/api-client'
import { type PurchasingScenario } from '@api/purchasing-scenario'
import { expect } from '@fixtures/test'
import { type APIResponse } from '@playwright/test'

export type Order = {
  status: string
  sub_total: number
  total_discount: number
  total: number
  discount_mode: string
  items: {
    id: string
    product_id: string
    qty: number
    received_qty: number
    returned_qty: number
    line_total: number
  }[]
}
export type Lot = {
  product_id: string
  warehouse_id: string
  supplier_id: string
  lot_number: string
  received_qty: number
  available_qty: number
  import_cost: number
}
export type LedgerEntry = {
  product_id: string
  warehouse_id: string
  lot_id: string
  type: string
  qty: number
  unit_cost: number
  balance_before: number
  balance_after: number
  lot_balance_after: number
  source_doc_type: string
  source_doc_id: string
  source_doc_number: string | null
}
export async function readOrder(api: ApiClient, id: string) {
  return (
    await api.get<{ data: { attributes: Order } }>(`/supplier-bc/v1/purchase-orders/${id}`, { relations: 'items' })
  ).data.attributes
}
export async function lots(s: PurchasingScenario) {
  return s.api.list<Lot>('/inventory-bc/v1/lots', { filter: `product_id||$eq||${s.productId}`, ignore_limit: 'true' })
}
export async function ledger(s: PurchasingScenario) {
  return s.api.list<LedgerEntry>('/inventory-bc/v1/stock-ledger-entries', { product_id: s.productId, limit: 100 })
}
export async function expectOrder(
  s: PurchasingScenario,
  id: string,
  status: string,
  ordered: number,
  received: number,
) {
  await expect(async () => {
    const actual = await readOrder(s.api, id)
    expect(actual.status).toBe(status)
    expect(actual.items).toEqual([
      expect.objectContaining({ product_id: s.productId, qty: ordered, received_qty: received, returned_qty: 0 }),
    ])
  }).toPass({ timeout: 10_000 })
  await expect.poll(() => s.stockQty()).toBe(received)
}
export async function expectRejection(response: APIResponse, status: 400 | 409, detail: string) {
  expect(response.status()).toBe(status)
  expect(await response.json()).toMatchObject({
    status: { code: status * 1000, message: detail },
    errors: [{ code: status === 409 ? 'CONFLICT' : 'BAD_REQUEST', detail }],
  })
}
/** Compare business data and ledger identities; ignore timestamps generated on read. */
export async function snapshot(s: PurchasingScenario, orderId: string) {
  const order = await readOrder(s.api, orderId)
  return { order, stock: await s.stockQty(), lots: await lots(s), ledger: await ledger(s) }
}

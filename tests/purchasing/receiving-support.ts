import { type PurchasingScenario } from '@api/purchasing-scenario'
import { expect } from '@fixtures/test'
import { type APIResponse } from '@playwright/test'

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
    const actual = await s.readOrder(id)
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
  const order = await s.readOrder(orderId)
  return stableReadFields({ order, stock: await s.stockQty(), lots: await lots(s), ledger: await ledger(s) })
}

/** Remove transport/read metadata recursively, retaining IDs and every business value. */
export function stableReadFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableReadFields)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !['created_at', 'updated_at', 'version'].includes(key))
        .map(([key, child]) => [key, stableReadFields(child)]),
    )
  return value
}

export async function expectOverReceipt(
  response: APIResponse,
  expected: {
    productId: string
    itemId: string
    qty: number
    received: number
    ordered: number
    allowance: number | string
  },
) {
  expect(response.status()).toBe(409)
  const body = await response.json()
  expect(body).toMatchObject({ status: { code: 409000 }, errors: [{ code: 'CONFLICT' }] })
  const detail = body.errors[0].detail as string
  expect(body.status.message).toBe(detail)
  const parsed =
    /^Receiving ([\d.]+) of product '([^']+)' would take purchase order item '([^']+)' to ([\d.]+), exceeding the allowed ([\d.]+) \(qty ([\d.]+) \+ ([\d.]+)% over-receipt allowance\)\.$/.exec(
      detail,
    )
  expect(parsed, 'Exact over-receipt domain error structure').not.toBeNull()
  expect(parsed![2]).toBe(expected.productId)
  expect(parsed![3]).toBe(expected.itemId)
  expect(Number(parsed![1])).toBe(expected.qty)
  expect(Number(parsed![4])).toBe(expected.received + expected.qty)
  expect(Number(parsed![5])).toBeCloseTo((expected.ordered * (100 + Number(expected.allowance))) / 100, 10)
  expect(Number(parsed![6])).toBe(expected.ordered)
  expect(Number(parsed![7])).toBe(Number(expected.allowance))
}

/**
 * ลบข้อมูลค้างที่เทสสร้าง (code/sku ขึ้นต้นด้วย `E2E-`) — ใช้หลังเทส crash กลางทาง
 *
 *   node scripts/cleanup-e2e-data.ts          # dry-run: แสดงรายการอย่างเดียว
 *   node scripts/cleanup-e2e-data.ts --apply  # ลบจริง (soft delete)
 *
 * ไม่แตะ user e2e.admin / e2e.staff
 */
import { existsSync, readFileSync } from 'node:fs'
import { expect } from '@playwright/test'
import { salesCleanupAction, type SalesCleanupRecord, type SalesResource } from '../src/data/sales-cleanup.ts'
import {
  SETTLEMENT_RESOURCES,
  settlementCleanupAction,
  type SettlementResource,
} from '../src/data/settlement-cleanup.ts'
import { financeCleanupAction, financeCleanupOrder, type FinanceResource } from '../src/data/finance-cleanup.ts'

import {
  purchasingCleanupAction,
  type PurchasingCleanupRecord,
  type PurchasingResource,
} from '../src/data/purchasing-cleanup.ts'

import {
  stockCleanupAction,
  stockPostingTime,
  type StockResource,
  type StockCleanupRecord,
} from '../src/data/stock-cleanup.ts'

const APPLY = process.argv.includes('--apply')

const TARGETS: {
  path: string
  field: string
  document?: SalesResource | PurchasingResource | FinanceResource
  stock?: StockResource
  settlement?: SettlementResource
}[] = [
  ...SETTLEMENT_RESOURCES.map((settlement) => ({
    path: `/finance-bc/v1/${settlement}`,
    field: 'remark_th',
    settlement,
  })),
  { path: '/finance-bc/v1/receipts', field: 'remark_th', document: 'receipts' },
  { path: '/finance-bc/v1/ap-invoices', field: 'remark_th', document: 'ap-invoices' },
  { path: '/inventory-bc/v1/stock-entries', field: 'remark_th', stock: 'stock-entries' },
  { path: '/inventory-bc/v1/stock-adjustments', field: 'remark_th', stock: 'stock-adjustments' },
  { path: '/sales-bc/v1/sales-returns', field: 'return_reason', document: 'sales-returns' },
  { path: '/sales-bc/v1/delivery-notes', field: 'remark_th', document: 'delivery-notes' },
  { path: '/inventory-bc/v1/purchase-returns', field: 'return_reason', document: 'purchase-returns' },
  { path: '/inventory-bc/v1/goods-receipts', field: 'remark_th', document: 'goods-receipts' },
  { path: '/supplier-bc/v1/purchase-orders', field: 'remark_th', document: 'purchase-orders' },
  { path: '/sales-bc/v1/sales-orders', field: 'remark_th', document: 'sales-orders' },
  { path: '/sales-bc/v1/quotations', field: 'remark_th', document: 'quotations' },
  { path: '/sales-bc/v1/customers', field: 'code' },
  { path: '/supplier-bc/v1/suppliers', field: 'code' },
  { path: '/inventory-bc/v1/products', field: 'sku' },
  { path: '/inventory-bc/v1/item-groups', field: 'name_th' },
  { path: '/inventory-bc/v1/uoms', field: 'name_th' },
]

const env: Record<string, string> = existsSync('.env')
  ? Object.fromEntries(
      readFileSync('.env', 'utf8')
        .split('\n')
        .filter((l) => /^[A-Z0-9_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    )
  : {}
const get = (k: string) => process.env[k] ?? env[k] ?? ''
const BASE = get('BASE_URL').replace(/\/+$/, '')

const loginRes = await fetch(`${BASE}/api/auth/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: get('E2E_USERNAME'), password: get('E2E_PASSWORD') }),
})
if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status}`)
const loginJson = await loginRes.json()
const attrs = loginJson.data?.attributes ?? loginJson
const headers = {
  Authorization: `Bearer ${attrs.access_token}`,
  ...(attrs.csrf_token ? { 'x-csrf-token': attrs.csrf_token } : {}),
}

let failures = 0
const receiptDependentOrders = new Set<string>()
const reversedOrders = new Set<string>()

async function stockIsZero(productId: string) {
  const query = new URLSearchParams({ product_id: productId, include_zero_qty: 'true', limit: '2000' })
  const response = await fetch(`${BASE}/api/inventory-bc/v1/stock-balances?${query}`, { headers })
  if (!response.ok) throw new Error(`stock read failed: ${response.status}`)
  const payload = await response.json()
  if (!Array.isArray(payload.data)) throw new Error('stock response has no data array')
  const data: { attributes: { total_qty: number } }[] = payload.data
  return data.every((row) => Number(row.attributes.total_qty) === 0)
}

async function cleanupStockDocuments() {
  // D1/D2 can depend on each other: reverse the last effective posting first across both resources.
  const stockDocuments: (StockCleanupRecord & { id: string; resource: StockResource })[] = []
  for (const target of TARGETS.filter((t) => t.stock)) {
    const query = new URLSearchParams({ filter: 'remark_th||$starts||E2E-', ignore_limit: 'true' })
    const response = await fetch(`${BASE}/api${target.path}?${query}`, { headers })
    if (!response.ok) {
      failures++
      console.warn(`✗ ${target.path}: ${response.status}`)
      continue
    }
    const rows: { id: string; attributes: StockCleanupRecord }[] = (await response.json()).data ?? []
    const mine = rows.filter((row) => row.attributes.remark?.th?.startsWith('E2E-'))
    let active = 0
    let cancelled = 0
    let unknown = 0
    for (const row of mine) {
      try {
        const action = stockCleanupAction(row.attributes)
        if (action === 'retain') cancelled++
        else active++
        stockDocuments.push({ id: row.id, ...row.attributes, resource: target.stock! })
      } catch (error) {
        unknown++
        failures++
        console.warn(
          `✗ ${target.path}/${row.id}: unknown stock status '${row.attributes.status}'; skipped (${String(error)})`,
        )
      }
    }
    console.log(
      `${target.path}: ${active + unknown} active E2E record(s); ${cancelled} cancelled audit record(s) retained; ${unknown} unknown status record(s) skipped`,
    )
  }
  for (const record of stockDocuments.sort((a, b) => stockPostingTime(b) - stockPostingTime(a))) {
    try {
      const action = stockCleanupAction(record)
      if (action === 'retain') continue
      if (!APPLY) {
        console.log(`  - ${record.remark?.th} (${record.status}; ${action})`)
        continue
      }
      const path = `${BASE}/api/inventory-bc/v1/${record.resource}/${record.id}`
      const write = async (suffix: string, method: string) => {
        const response = await fetch(`${path}${suffix}`, {
          method,
          headers: { ...headers, 'Content-Type': 'application/json' },
          ...(method === 'POST' ? { body: JSON.stringify({ cancel_reason: 'E2E- จบการทดสอบ' }) } : {}),
        })
        if (!response.ok) throw new Error(`${method} ${record.resource}/${suffix}: ${response.status}`)
      }
      if (action === 'delete') await write('', 'DELETE')
      else {
        // erp-api#18: cancelling a held adjustment is broken. Owned E2E stock only: approve then reverse.
        if (action === 'approve-cancel') await write('/approve', 'POST')
        await write('/cancel', 'POST')
        await expect
          .poll(
            async () => {
              const res = await fetch(path, { headers })
              if (!res.ok) throw new Error(`stock read: ${res.status}`)
              return (await res.json()).data.attributes.status
            },
            { timeout: 10_000 },
          )
          .toBe('CANCELLED')
      }
      console.log(`  ✓ ${action}: ${record.remark?.th}`)
    } catch (error) {
      failures++
      console.warn(`✗ stock cleanup ${record.id}: ${String(error)}`)
    }
  }
}

for (const t of TARGETS) {
  if (t.stock) {
    if (t.stock === 'stock-entries') await cleanupStockDocuments()
    continue
  }
  if (t.document === 'purchase-orders' && APPLY) {
    for (const id of reversedOrders) {
      try {
        await expect
          .poll(
            async () => {
              const response = await fetch(`${BASE}/api${t.path}/${id}`, { headers })
              if (!response.ok) throw new Error(`PO read failed: ${response.status}`)
              return (await response.json()).data.attributes.status
            },
            { timeout: 10_000 },
          )
          .toBe('SENT')
      } catch {
        failures += 1
        console.warn(`✗ PO ${id}: reversal not visible; subsequent actions use current state`)
      }
    }
  }
  const qs = new URLSearchParams({ filter: `${t.field}||$starts||E2E-`, ignore_limit: 'true' })
  if (t.document === 'sales-orders' || t.document === 'purchase-orders') qs.set('relations', 'items')
  if (t.settlement) qs.set('sort', 'created_at:DESC')
  const res = await fetch(`${BASE}/api${t.path}?${qs}`, { headers })
  if (!res.ok) {
    failures += 1
    console.warn(`✗ ${t.path}: ${res.status}`)
    continue
  }
  const rows: { id: string; attributes: Record<string, unknown> }[] = (await res.json()).data ?? []
  // กันพลาด: filter ซ้ำฝั่ง client เผื่อ backend ไม่รองรับ $starts แล้วคืนทั้งหมด
  const ownedKey = (r: (typeof rows)[number]) =>
    String(
      t.field === 'remark_th'
        ? ((r.attributes.remark as { th?: string } | undefined)?.th ?? r.attributes.remark_th ?? '')
        : t.field === 'name_th'
          ? ((r.attributes.name as { th?: string } | undefined)?.th ?? r.attributes.name_th ?? '')
          : (r.attributes[t.field] ?? ''),
    )
  // Bundles must be removed before component products or the API returns 409.
  const mine = rows
    .filter((r) => ownedKey(r).startsWith('E2E-'))
    .sort((a, b) => Number(b.attributes.type === 'bundle') - Number(a.attributes.type === 'bundle'))
  if (t.document === 'receipts' || t.document === 'ap-invoices')
    mine.sort((a, b) => financeCleanupOrder(a.attributes as { status: string }, b.attributes as { status: string }))
  if (t.document === 'goods-receipts') {
    for (const row of mine)
      if (row.attributes.status === 'SUBMITTED' && row.attributes.po_id)
        receiptDependentOrders.add(String(row.attributes.po_id))
  }
  const settlementActions = new Map<string, 'delete' | 'cancel' | 'retain'>()
  if (t.settlement)
    for (const row of mine) {
      try {
        settlementActions.set(row.id, settlementCleanupAction(t.settlement, String(row.attributes.status)))
      } catch (error) {
        failures++
        console.warn(`✗ ${t.path}/${row.id}: ${String(error)}`)
        settlementActions.set(row.id, 'retain')
      }
    }
  const blockedSchedules = new Set<string>()
  if (t.document === 'receipts')
    for (const row of mine.filter((r) => ownedKey(r).includes('[E2E-SCHEDULE]'))) {
      try {
        const path = `${BASE}/api${t.path}/${row.id}/payment-schedules`
        const response = await fetch(path, { headers })
        if (!response.ok) throw new Error(`schedule read: ${response.status}`)
        const data = (await response.json()).data
        if (!Array.isArray(data)) throw new Error('Invalid schedule response')
        console.log(`${t.path}/${row.id}/payment-schedules: ${data.length} active owned child record(s)`)
        if (data.length && APPLY) {
          const removed = await fetch(path, { method: 'DELETE', headers })
          if (!removed.ok) throw new Error(`schedule delete: ${removed.status}`)
        } else if (data.length) failures++
      } catch (error) {
        failures++
        blockedSchedules.add(row.id)
        console.warn(`✗ schedules ${row.id}: ${String(error)}`)
      }
    }
  const isDocument = Boolean(t.document || t.settlement)
  const actionFor = (row: (typeof mine)[number]) => {
    if (t.settlement) return settlementActions.get(row.id) ?? 'retain'

    if (t.document === 'receipts' || t.document === 'ap-invoices')
      return financeCleanupAction(t.document, row.attributes as { status: string })
    if (!APPLY && t.document === 'purchase-orders' && receiptDependentOrders.has(row.id)) return 'defer'
    if (t.document === 'purchase-orders' || t.document === 'goods-receipts' || t.document === 'purchase-returns')
      return purchasingCleanupAction(t.document, row.attributes as PurchasingCleanupRecord)
    return t.document ? salesCleanupAction(t.document, row.attributes as SalesCleanupRecord) : 'delete'
  }
  const retained = mine.filter((r) => actionFor(r) === 'retain')
  const active = mine.filter((r) => actionFor(r) !== 'retain')
  const isAudit = (row: (typeof mine)[number]) => ['CANCELLED', 'VOID'].includes(String(row.attributes.status))
  const cancelled = retained.filter(isAudit).length
  const terminal = retained.filter((r) => !isAudit(r))
  const auditLabel = t.document === 'receipts' ? 'void' : 'cancelled'
  console.log(
    `${t.path}: ${active.length} ${isDocument ? 'active ' : ''}E2E record(s)${isDocument ? `; ${cancelled} ${auditLabel} audit record(s) retained; ${terminal.length} non-cancellable record(s) retained` : ''}${rows.length > mine.length ? ` (ignored ${rows.length - mine.length} non-E2E)` : ''}`,
  )
  for (const r of terminal) {
    const relation =
      t.document === 'purchase-orders'
        ? 'PO current state / net received guard'
        : t.document === 'goods-receipts'
          ? `linked PO: ${String(r.attributes.po_id ?? 'none')}`
          : t.document === 'purchase-returns'
            ? `linked GR: ${String(r.attributes.grn_id ?? 'none')}`
            : t.document === 'sales-returns'
              ? `linked DN: ${String(r.attributes.dn_id ?? 'none')}`
              : t.document === 'ap-invoices' || t.document === 'receipts'
                ? `reference: ${String(r.attributes.reference_ap_invoice_id ?? r.attributes.reference_receipt_id ?? 'none')}`
                : `linked SO: ${Boolean(r.attributes.sales_order_id)}`
    console.log(`  retained: ${ownedKey(r)} (${String(r.attributes.status)}, ${relation})`)
  }
  for (const r of active) {
    if (blockedSchedules.has(r.id)) continue
    if (!APPLY && actionFor(r) === 'defer') {
      console.log(
        `  deferred: ${ownedKey(r)} (${r.id}); reassess PO state after linked GR cancellation succeeds, no cancellation assumed`,
      )
      continue
    }
    if (t.path === '/inventory-bc/v1/products') {
      try {
        if (APPLY) await expect.poll(() => stockIsZero(r.id), { timeout: 10_000 }).toBe(true)
        else if (!(await stockIsZero(r.id))) throw new Error('nonzero stock')
      } catch {
        failures += 1
        console.warn(`  ✗ blocked product ${ownedKey(r)}: stock nonzero or unreadable; refusing deletion`)
        continue
      }
    }
    if (!APPLY) {
      console.log(`  - ${ownedKey(r)} (${r.id})`)
      continue
    }
    const cancel = actionFor(r) === 'cancel'
    const voidDocument = actionFor(r) === 'void'
    const writeAction = cancel ? 'cancel' : voidDocument ? 'void' : null
    const del = await fetch(`${BASE}/api${t.path}/${r.id}${writeAction ? `/${writeAction}` : ''}`, {
      method: writeAction ? 'POST' : 'DELETE',
      headers: { ...headers, ...(writeAction ? { 'Content-Type': 'application/json' } : {}) },
      ...(writeAction
        ? {
            body: JSON.stringify(
              voidDocument ? { void_reason: 'E2E- จบการทดสอบ' } : { cancel_reason: 'E2E- จบการทดสอบ' },
            ),
          }
        : {}),
    })
    if (!del.ok) failures += 1
    if (del.ok && cancel && t.document === 'goods-receipts' && r.attributes.po_id)
      reversedOrders.add(String(r.attributes.po_id))
    console.log(
      `  ${del.ok ? (writeAction ? `✓ ${writeAction} (audit retained)` : '✓ deleted') : `✗ ${del.status}`} ${ownedKey(r)}`,
    )
  }
}
if (!APPLY) console.log('\n(dry-run — add --apply to delete)')

if (failures) process.exitCode = 1

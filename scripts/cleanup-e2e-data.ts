/**
 * ลบข้อมูลค้างที่เทสสร้าง (code/sku ขึ้นต้นด้วย `E2E-`) — ใช้หลังเทส crash กลางทาง
 *
 *   node scripts/cleanup-e2e-data.ts          # dry-run: แสดงรายการอย่างเดียว
 *   node scripts/cleanup-e2e-data.ts --apply  # ลบจริง (soft delete)
 *
 * ไม่แตะ user e2e.admin / e2e.staff
 */
import { existsSync, readFileSync } from 'node:fs'
import { salesCleanupAction, type SalesCleanupRecord, type SalesResource } from '../src/data/sales-cleanup.ts'

import {
  purchasingCleanupAction,
  type PurchasingCleanupRecord,
  type PurchasingResource,
} from '../src/data/purchasing-cleanup.ts'

const APPLY = process.argv.includes('--apply')

const TARGETS: { path: string; field: string; document?: SalesResource | PurchasingResource }[] = [
  { path: '/inventory-bc/v1/goods-receipts', field: 'remark_th', document: 'goods-receipts' },
  { path: '/supplier-bc/v1/purchase-orders', field: 'remark_th', document: 'purchase-orders' },
  { path: '/sales-bc/v1/delivery-notes', field: 'remark_th', document: 'delivery-notes' },
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

for (const t of TARGETS) {
  const qs = new URLSearchParams({ filter: `${t.field}||$starts||E2E-`, ignore_limit: 'true' })
  if (t.document === 'sales-orders' || t.document === 'purchase-orders') qs.set('relations', 'items')
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
  const actionFor = (row: (typeof mine)[number]) => {
    if (t.document === 'purchase-orders' || t.document === 'goods-receipts')
      return purchasingCleanupAction(t.document, row.attributes as PurchasingCleanupRecord)
    return t.document ? salesCleanupAction(t.document, row.attributes as SalesCleanupRecord) : 'delete'
  }
  const retained = mine.filter((r) => actionFor(r) === 'retain')
  const active = mine.filter((r) => actionFor(r) !== 'retain')
  const cancelled = retained.filter((r) => r.attributes.status === 'CANCELLED').length
  const terminal = retained.filter((r) => r.attributes.status !== 'CANCELLED')
  console.log(
    `${t.path}: ${active.length} ${t.document ? 'active ' : ''}E2E record(s)${t.document ? `; ${cancelled} cancelled audit record(s) retained; ${terminal.length} non-cancellable record(s) retained` : ''}${rows.length > mine.length ? ` (ignored ${rows.length - mine.length} non-E2E)` : ''}`,
  )
  for (const r of terminal)
    console.log(
      `  retained: ${ownedKey(r)} (${String(r.attributes.status)}, linked SO: ${Boolean(r.attributes.sales_order_id)})`,
    )
  for (const r of active) {
    if (!APPLY) {
      console.log(`  - ${ownedKey(r)} (${r.id})`)
      continue
    }
    const cancel = actionFor(r) === 'cancel'
    const del = await fetch(`${BASE}/api${t.path}/${r.id}${cancel ? '/cancel' : ''}`, {
      method: cancel ? 'POST' : 'DELETE',
      headers: { ...headers, ...(cancel ? { 'Content-Type': 'application/json' } : {}) },
      ...(cancel ? { body: JSON.stringify({ cancel_reason: 'E2E- จบการทดสอบ' }) } : {}),
    })
    if (!del.ok) failures += 1
    console.log(
      `  ${del.ok ? (cancel ? '✓ cancelled (audit retained)' : '✓ deleted') : `✗ ${del.status}`} ${ownedKey(r)}`,
    )
  }
}
if (!APPLY) console.log('\n(dry-run — add --apply to delete)')

if (failures) process.exitCode = 1

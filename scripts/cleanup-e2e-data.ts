/**
 * ลบข้อมูลค้างที่เทสสร้าง (code/sku ขึ้นต้นด้วย `E2E-`) — ใช้หลังเทส crash กลางทาง
 *
 *   node scripts/cleanup-e2e-data.ts          # dry-run: แสดงรายการอย่างเดียว
 *   node scripts/cleanup-e2e-data.ts --apply  # ลบจริง (soft delete)
 *
 * ไม่แตะ user e2e.admin / e2e.staff
 */
import { existsSync, readFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')

const TARGETS = [
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
      t.field === 'name_th'
        ? ((r.attributes.name as { th?: string } | undefined)?.th ?? r.attributes.name_th ?? '')
        : (r.attributes[t.field] ?? ''),
    )
  // Bundles must be removed before component products or the API returns 409.
  const mine = rows
    .filter((r) => ownedKey(r).startsWith('E2E-'))
    .sort((a, b) => Number(b.attributes.type === 'bundle') - Number(a.attributes.type === 'bundle'))
  console.log(
    `${t.path}: ${mine.length} E2E record(s)${rows.length !== mine.length ? ` (ignored ${rows.length - mine.length} non-E2E)` : ''}`,
  )
  for (const r of mine) {
    if (!APPLY) {
      console.log(`  - ${ownedKey(r)} (${r.id})`)
      continue
    }
    const del = await fetch(`${BASE}/api${t.path}/${r.id}`, { method: 'DELETE', headers })
    if (!del.ok) failures += 1
    console.log(`  ${del.ok ? '✓ deleted' : `✗ ${del.status}`} ${ownedKey(r)}`)
  }
}
if (!APPLY) console.log('\n(dry-run — add --apply to delete)')

if (failures) process.exitCode = 1

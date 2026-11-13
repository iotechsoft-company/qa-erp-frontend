/**
 * ดึง OpenAPI JSON ของทุก BC มาเก็บที่ `.openapi/<prefix>.json` (gitignored)
 * ใช้อ้างอิง DTO / required field / enum ตอนเขียน factory และ API helper
 *
 *   node scripts/fetch-openapi.ts
 *
 * ยิงผ่าน `BASE_URL/api/<prefix>/v1/json-docs` ด้วย token ของ E2E_USERNAME
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const PREFIXES = ['auth', 'iam', 'inventory-bc', 'supplier-bc', 'sales-bc', 'finance-bc', 'report-bc']
const OUT_DIR = '.openapi'

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
const token: string = (loginJson.data?.attributes ?? loginJson).access_token

mkdirSync(OUT_DIR, { recursive: true })
for (const prefix of PREFIXES) {
  const res = await fetch(`${BASE}/api/${prefix}/v1/json-docs`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    console.warn(`✗ ${prefix}: ${res.status}`)
    continue
  }
  const spec = await res.json()
  writeFileSync(`${OUT_DIR}/${prefix}.json`, JSON.stringify(spec, null, 2))
  console.log(`✓ ${prefix}: ${Object.keys(spec.paths ?? {}).length} paths`)
}

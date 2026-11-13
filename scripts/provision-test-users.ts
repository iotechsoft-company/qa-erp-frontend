/**
 * Provision บัญชีผู้ใช้สำหรับ E2E บน env ปัจจุบัน (อ่าน BASE_URL / ADMIN_* จาก .env)
 *
 *   node scripts/provision-test-users.ts
 *
 * Flow ต่อ user:
 *   1. หา user จาก username — ไม่มี → POST /iam/v1/users (ได้ temp_password)
 *                             มีแล้ว → POST /iam/v1/users/:id/reset-password (ได้ temp_password ใหม่)
 *   2. PUT /iam/v1/users/:id/roles  ตาม role code
 *   3. login ด้วย temp_password → POST /auth/v1/auth/change-password เป็นรหัสใหม่ (สุ่ม)
 *   4. เขียน username/password ลง .env (gitignored)
 *
 * ยิงผ่าน same-origin proxy ของ Next (`BASE_URL/api/*`) — ไม่ต้องรู้/ไม่เก็บ API domain
 * Idempotent: รันซ้ำได้ (จะ rotate password ใหม่ทุกครั้ง)
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const ENV_FILE = '.env'

type TestUser = {
  envPrefix: string
  username: string
  employee_id: string
  full_name: string
  email: string
  department: string
  roleCode: string
}

const TEST_USERS: TestUser[] = [
  {
    envPrefix: 'E2E',
    username: 'e2e.admin',
    employee_id: 'QA-E2E-001',
    full_name: 'ทดสอบ อัตโนมัติ (Admin)',
    email: 'e2e.admin@erp.local',
    department: 'QA Automation',
    roleCode: 'ROLE_SUPERADMIN',
  },
  {
    envPrefix: 'E2E_STAFF',
    username: 'e2e.staff',
    employee_id: 'QA-E2E-002',
    full_name: 'ทดสอบ อัตโนมัติ (Staff)',
    email: 'e2e.staff@erp.local',
    department: 'QA Automation',
    roleCode: 'ROLE_STAFF',
  },
]

// ─── .env helpers ───────────────────────────────────────────
const readEnv = (): Record<string, string> => {
  if (!existsSync(ENV_FILE)) throw new Error('.env not found — copy .env.example first')
  return Object.fromEntries(
    readFileSync(ENV_FILE, 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  )
}

const upsertEnv = (values: Record<string, string>) => {
  let text = readFileSync(ENV_FILE, 'utf8')
  for (const [key, value] of Object.entries(values)) {
    const re = new RegExp(`^${key}=.*$`, 'm')
    text = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`
  }
  writeFileSync(ENV_FILE, text)
}

// ─── HTTP ───────────────────────────────────────────────────
const env = readEnv()
const BASE = (process.env.BASE_URL ?? env.BASE_URL ?? '').replace(/\/+$/, '')
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? env.ADMIN_USERNAME
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? env.ADMIN_PASSWORD
if (!BASE || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error(
    'Need BASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD in .env (an existing admin used only for provisioning)',
  )
}

type JsonApi<T> = { data: { id: string; attributes: T } | { id: string; attributes: T }[]; meta?: unknown }

const call = async <T>(method: string, path: string, token?: string, body?: unknown): Promise<JsonApi<T>> => {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`)
  return (text ? JSON.parse(text) : {}) as JsonApi<T>
}

const one = <T>(r: JsonApi<T>) => (Array.isArray(r.data) ? r.data[0]! : r.data)
const many = <T>(r: JsonApi<T>) => (Array.isArray(r.data) ? r.data : [r.data])

const login = async (username: string, password: string) =>
  one(await call<{ access_token: string }>('POST', '/auth/v1/auth/login', undefined, { username, password })).attributes
    .access_token

const strongPassword = () => `E2e!${randomBytes(9).toString('base64url')}9a`

// ─── main ───────────────────────────────────────────────────
const adminToken = await login(ADMIN_USERNAME, ADMIN_PASSWORD)

const roles = many(await call<{ code: string }>('GET', '/iam/v1/roles?ignore_limit=true', adminToken))

for (const u of TEST_USERS) {
  const role = roles.find((r) => r.attributes.code === u.roleCode)
  if (!role) throw new Error(`Role ${u.roleCode} not found`)

  const found = many(
    await call<{ username: string }>(
      'GET',
      `/iam/v1/users?filter=${encodeURIComponent(`username||$eq||${u.username}`)}`,
      adminToken,
    ),
  ).find((x) => x.attributes.username === u.username)

  let userId: string
  let tempPassword: string
  if (found) {
    userId = found.id
    tempPassword = one(
      await call<{ temp_password: string }>('POST', `/iam/v1/users/${userId}/reset-password`, adminToken),
    ).attributes.temp_password
    console.log(`• ${u.username} exists (${userId}) — password reset`)
  } else {
    const { envPrefix: _p, roleCode: _r, ...dto } = u
    const created = one(
      await call<{ temp_password: string }>('POST', '/iam/v1/users', adminToken, { ...dto, status: 'active' }),
    )
    userId = created.id
    tempPassword = created.attributes.temp_password
    console.log(`• ${u.username} created (${userId})`)
  }

  await call('PUT', `/iam/v1/users/${userId}/roles`, adminToken, { role_ids: [role.id] })

  const newPassword = strongPassword()
  const userToken = await login(u.username, tempPassword)
  await call('POST', '/auth/v1/auth/change-password', userToken, {
    current_password: tempPassword,
    new_password: newPassword,
    confirm_password: newPassword,
  })
  await login(u.username, newPassword) // verify

  upsertEnv({ [`${u.envPrefix}_USERNAME`]: u.username, [`${u.envPrefix}_PASSWORD`]: newPassword })
  console.log(`  ✓ role ${u.roleCode}, password set, written to .env as ${u.envPrefix}_USERNAME/_PASSWORD`)
}

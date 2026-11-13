import { type APIRequestContext } from '@playwright/test'

/**
 * API helper สำหรับ seed / cleanup ข้อมูลเทส (เร็วกว่าทำผ่าน UI)
 *
 * ยิงผ่าน same-origin proxy ของ Next (`/api/*` → NEXT_PUBLIC_API_URL)
 * จึงไม่ต้องรู้ API domain จริง — ห้าม hard-code API domain ในรีโปนี้
 *
 * Response เป็น JSON:API envelope: `{ data: { id, type, attributes } }`
 * สเปกจริงของแต่ละ BC อ่านได้ที่ `/api/<prefix>/v1/json-docs`
 */
export class ApiClient {
  private accessToken?: string
  private csrfToken?: string

  constructor(private readonly request: APIRequestContext) {}

  async login(username: string, password: string) {
    const res = await this.request.post('/api/auth/v1/auth/login', { data: { username, password } })
    if (!res.ok()) throw new Error(`API login failed: ${res.status()} ${await res.text()}`)
    const json = await res.json()
    const attrs = json.data?.attributes ?? json
    this.accessToken = attrs.access_token
    // login ตั้ง csrf_token cookie ด้วย → request ที่แนบ cookie นั้นต้องส่ง x-csrf-token กลับ (double-submit)
    this.csrfToken = attrs.csrf_token
    return attrs as { access_token: string; refresh_token: string; csrf_token?: string; expires_in: number }
  }

  private headers(): Record<string, string> {
    return {
      ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      ...(this.csrfToken ? { 'x-csrf-token': this.csrfToken } : {}),
    }
  }

  async get<T = unknown>(path: string, params?: Record<string, string | number>) {
    const res = await this.request.get(`/api${path}`, { headers: this.headers(), params })
    if (!res.ok()) throw new Error(`GET ${path} → ${res.status()}`)
    return (await res.json()) as T
  }

  /** Raw response for contracts that assert an expected non-2xx status and body. */
  async postResponse(path: string, data: unknown) {
    return this.request.post(`/api${path}`, { headers: this.headers(), data })
  }

  async post<T = unknown>(path: string, data: unknown) {
    const res = await this.postResponse(path, data)
    if (!res.ok()) throw new Error(`POST ${path} → ${res.status()} ${await res.text()}`)
    return (await res.json()) as T
  }

  /** POST แล้วคืน `{ id, ...attributes }` จาก JSON:API envelope */
  async create<T extends object = Record<string, unknown>>(path: string, data: unknown) {
    const json = await this.post<{ data: { id: string; attributes: T } }>(path, data)
    return { id: json.data.id, ...json.data.attributes }
  }

  /** GET list แล้วคืน array ของ `{ id, ...attributes }` */
  async list<T extends object = Record<string, unknown>>(path: string, params?: Record<string, string | number>) {
    const json = await this.get<{ data: { id: string; attributes: T }[] }>(path, params)
    return json.data.map((d) => ({ id: d.id, ...d.attributes }))
  }

  /** id ของ record แรกใน list (ใช้ lookup ข้อมูลอ้างอิง เช่น uom / item-group) */
  async firstId(path: string, params?: Record<string, string | number>) {
    const [first] = await this.list(path, { limit: 1, ...params })
    if (!first) throw new Error(`No records at ${path} — seed reference data first`)
    return first.id
  }

  async put<T = unknown>(path: string, data: unknown) {
    const res = await this.request.put(`/api${path}`, { headers: this.headers(), data })
    if (!res.ok()) throw new Error(`PUT ${path} → ${res.status()} ${await res.text()}`)
    return (await res.json()) as T
  }

  async delete(path: string) {
    const res = await this.request.delete(`/api${path}`, { headers: this.headers() })
    if (!res.ok()) throw new Error(`DELETE ${path} → ${res.status()} ${await res.text()}`)
  }
}

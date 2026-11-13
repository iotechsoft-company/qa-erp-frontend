import 'dotenv/config'
import { z } from 'zod'

/**
 * ค่า config ทั้งหมดอ่านจาก env เท่านั้น — validate ตอนโหลดให้ fail เร็วถ้าตั้งค่าผิด
 * ห้าม hard-code URL / credential ในโค้ดเทส
 */
const EnvSchema = z.object({
  BASE_URL: z.url().transform((v) => v.replace(/\/+$/, '')),
  TEST_ENV: z.string().default('dev'),
  E2E_USERNAME: z.string().default(''),
  E2E_PASSWORD: z.string().default(''),
  /** บัญชี ROLE_STAFF สำหรับเทสสิทธิ์ (สร้างด้วย `pnpm provision:users`) */
  E2E_STAFF_USERNAME: z.string().default(''),
  E2E_STAFF_PASSWORD: z.string().default(''),
  ALLOW_MUTATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  CI: z
    .string()
    .optional()
    .transform((v) => !!v),
})

export const env = EnvSchema.parse(process.env)

export const requireStaffCredentials = () => {
  if (!env.E2E_STAFF_USERNAME || !env.E2E_STAFF_PASSWORD) {
    throw new Error('Missing E2E_STAFF_USERNAME / E2E_STAFF_PASSWORD — run `pnpm provision:users`')
  }
  return { username: env.E2E_STAFF_USERNAME, password: env.E2E_STAFF_PASSWORD }
}

export const requireCredentials = () => {
  if (!env.E2E_USERNAME || !env.E2E_PASSWORD) {
    throw new Error('Missing E2E_USERNAME / E2E_PASSWORD — copy .env.example to .env and fill them in')
  }
  return { username: env.E2E_USERNAME, password: env.E2E_PASSWORD }
}

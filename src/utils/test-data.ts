import { faker } from '@faker-js/faker'

/** prefix ทุกข้อมูลที่เทสสร้าง เพื่อให้ค้นหา/ลบทิ้งได้ง่าย */
export const E2E_PREFIX = 'E2E'

export const uniqueName = (label: string) => `${E2E_PREFIX}-${label}-${Date.now()}-${faker.string.alphanumeric(4)}`

export const randomSku = () => `${E2E_PREFIX}-${faker.string.alphanumeric({ length: 8, casing: 'upper' })}`

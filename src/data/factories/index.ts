import { faker } from '@faker-js/faker'

import { e2eCode } from './ids'
export { e2eCode } from './ids'

import {
  thaiAddress,
  thaiCompany,
  thaiContactPerson,
  thaiCorporateTaxId,
  thaiLandline,
  thaiMobile,
  thaiPersonName,
  thaiPersonalTaxId,
  thaiProduct,
} from './thai'

/**
 * Entity factories — shape ตรงกับ Create*DTO ใน `.openapi/<bc>.json` (รัน `node scripts/fetch-openapi.ts`)
 *
 * กติกา: ชื่อ/ที่อยู่สมจริง แต่ `code` / `sku` ขึ้นต้นด้วย `E2E-` เสมอ
 *   → ค้นหาและ cleanup ได้ด้วย filter `code||$starts||E2E-`
 * ทุก factory รับ overrides เพื่อกำหนดค่าเฉพาะในเทส
 */

// ─── sales-bc: POST /sales-bc/v1/customers (CreateCustomerDTO) ───
export type CustomerInput = {
  code: string
  name_th: string
  name_en?: string
  tax_id: string
  is_vat_registered?: boolean
  customer_type?: 'company' | 'individual'
  customer_group_id?: string
  contact_phone?: string
  contact_person?: string
  address?: string
  country?: string
  alias?: string
  credit_terms?: number
  credit_limit?: number
  billing_currency?: string
  is_active?: boolean
}

export const buildCustomer = (overrides: Partial<CustomerInput> = {}): CustomerInput => {
  const type =
    overrides.customer_type ??
    faker.helpers.weightedArrayElement([
      { weight: 8, value: 'company' as const },
      { weight: 2, value: 'individual' as const },
    ])
  const addr = thaiAddress()
  const base: CustomerInput =
    type === 'company'
      ? (() => {
          const c = thaiCompany()
          return {
            code: e2eCode('CUS'),
            name_th: c.name_th,
            name_en: c.name_en,
            alias: c.alias,
            tax_id: thaiCorporateTaxId(),
            is_vat_registered: true,
            customer_type: 'company',
            contact_person: thaiContactPerson(),
            contact_phone: thaiLandline(addr.phonePrefix),
            credit_terms: faker.helpers.arrayElement([0, 15, 30, 45, 60]),
            credit_limit: faker.helpers.arrayElement([50_000, 100_000, 300_000, 500_000, 1_000_000]),
          }
        })()
      : {
          code: e2eCode('CUS'),
          name_th: thaiPersonName(),
          tax_id: thaiPersonalTaxId(),
          is_vat_registered: false,
          customer_type: 'individual',
          contact_phone: thaiMobile(),
          credit_terms: 0,
          credit_limit: 0,
        }
  return { ...base, address: addr.line, country: 'TH', billing_currency: 'THB', is_active: true, ...overrides }
}

// ─── supplier-bc: POST /supplier-bc/v1/suppliers (CreateSupplierDTO) ───
export type SupplierInput = {
  code: string
  name_th: string
  name_en?: string
  tax_id: string
  is_vat_registered?: boolean
  supplier_type?: 'company' | 'individual'
  supplier_group_id?: string
  payment_terms_template?: string
  contact_phone?: string
  address?: string
  country?: string
  alias?: string
  credit_terms?: number
  billing_currency?: string
  is_active?: boolean
}

export const buildSupplier = (overrides: Partial<SupplierInput> = {}): SupplierInput => {
  const type = overrides.supplier_type ?? 'company'
  const c = thaiCompany()
  const addr = thaiAddress()
  return {
    code: e2eCode('SUP'),
    name_th: type === 'individual' ? thaiPersonName() : c.name_th,
    name_en: type === 'individual' ? undefined : c.name_en,
    alias: type === 'individual' ? undefined : c.alias,
    tax_id: type === 'individual' ? thaiPersonalTaxId() : thaiCorporateTaxId(),
    is_vat_registered: type === 'company',
    supplier_type: type,
    contact_phone: type === 'individual' ? thaiMobile() : thaiLandline(addr.phonePrefix),
    address: addr.line,
    country: 'TH',
    credit_terms: faker.helpers.arrayElement([30, 45, 60, 90]),
    billing_currency: 'THB',
    is_active: true,
    ...overrides,
  }
}

// ─── inventory-bc: POST /inventory-bc/v1/products (CreateProductDTO) ───
export type ProductInput = {
  sku?: string
  name_th: string
  name_en?: string
  type: 'single' | 'bundle'
  item_group_id: string
  stock_uom_id: string
  brand_id?: string
  supplier_id?: string
  tax_category_id?: string
  has_variants?: boolean
}

/** ต้องส่ง item_group_id + stock_uom_id (lookup จาก API ก่อน — ดู ApiClient) */
export const buildProduct = (
  refs: Pick<ProductInput, 'item_group_id' | 'stock_uom_id'>,
  overrides: Partial<ProductInput> = {},
): ProductInput => {
  const p = thaiProduct()
  return {
    sku: e2eCode(p.sku),
    name_th: p.th,
    name_en: p.en,
    type: 'single',
    has_variants: false,
    ...refs,
    ...overrides,
  }
}

// These DTOs have no code field; prefix name_th so cleanup can identify ownership.
export type ItemGroupInput = {
  name_th: string
  name_en?: string
  is_group: boolean
  parent_item_group_id?: string | null
}
export const buildItemGroup = (overrides: Partial<ItemGroupInput> = {}): ItemGroupInput => ({
  name_th: `${e2eCode('IG')} เครื่องเขียนสำนักงาน`,
  name_en: 'Office stationery',
  is_group: false,
  parent_item_group_id: null,
  ...overrides,
})

export type UomInput = { name_th: string; name_en?: string; is_whole_number: boolean }
export const buildUom = (overrides: Partial<UomInput> = {}): UomInput => ({
  name_th: `${e2eCode('UOM')} ชิ้น`,
  name_en: 'Piece',
  is_whole_number: true,
  ...overrides,
})

export * from './sales'

export * from './purchasing'

import { buildCustomer, buildItemGroup, buildProduct, buildSupplier, buildUom } from '@data/factories'
import { isValidThaiTaxId } from '@data/factories/thai'
import { expect, test } from '@fixtures/test'

/**
 * ยืนยันว่า factory payload ผ่าน validation ของ API จริง (create → get → delete)
 * ถ้า DTO ฝั่ง backend เปลี่ยน เทสนี้จะพังก่อนเทส UI
 */
test.describe('Data factories ↔ API contract', { tag: ['@regression', '@mutation', '@api'] }, () => {
  test.beforeEach(({ allowMutation }) => void allowMutation)

  test('customer', { tag: '@customer' }, async ({ api }) => {
    const input = buildCustomer({ customer_type: 'company' })
    expect(isValidThaiTaxId(input.tax_id)).toBe(true)
    // response คืนชื่อเป็น i18n object `name: { th, en }` (ไม่ใช่ name_th)
    const created = await api.create<{ code: string; name: { th: string } }>('/sales-bc/v1/customers', input)
    try {
      expect(created).toMatchObject({ code: input.code, name: { th: input.name_th } })
    } finally {
      await api.delete(`/sales-bc/v1/customers/${created.id}`)
    }
  })

  test('supplier', { tag: '@purchasing' }, async ({ api }) => {
    const input = buildSupplier()
    const created = await api.create<{ code: string }>('/supplier-bc/v1/suppliers', input)
    try {
      expect(created.code).toBe(input.code)
    } finally {
      await api.delete(`/supplier-bc/v1/suppliers/${created.id}`)
    }
  })

  for (const [resource, factory] of [
    ['item-groups', buildItemGroup],
    ['uoms', buildUom],
  ] as const) {
    test(resource, { tag: '@inventory' }, async ({ api }) => {
      const input = factory()
      const path = `/inventory-bc/v1/${resource}`
      const created = await api.create<{ name: { th: string } }>(path, input)
      try {
        expect(created.name.th).toBe(input.name_th)
        await expect(async () => {
          const fetched = await api.get<{ data: { attributes: { name: { th: string } } } }>(`${path}/${created.id}`)
          expect(fetched.data.attributes.name.th).toBe(input.name_th)
        }).toPass({ timeout: 10_000 })
      } finally {
        await api.delete(`${path}/${created.id}`)
      }
    })
  }

  test('product', { tag: '@inventory' }, async ({ api }) => {
    const input = buildProduct({
      // product ผูกได้เฉพาะ leaf item group (is_group=false)
      item_group_id: await api.firstId('/inventory-bc/v1/item-groups', { filter: 'is_group||$eq||false' }),
      stock_uom_id: await api.firstId('/inventory-bc/v1/uoms'),
    })
    const created = await api.create<{ sku: string }>('/inventory-bc/v1/products', input)
    try {
      expect(created.sku).toBe(input.sku)
    } finally {
      await api.delete(`/inventory-bc/v1/products/${created.id}`)
    }
  })
})

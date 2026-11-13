import { buildCustomer, buildProduct, buildSupplier } from '@data/factories'
import { isValidThaiTaxId } from '@data/factories/thai'
import { expect, test } from '@fixtures/test'

/**
 * ยืนยันว่า factory payload ผ่าน validation ของ API จริง (create → get → delete)
 * ถ้า DTO ฝั่ง backend เปลี่ยน เทสนี้จะพังก่อนเทส UI
 */
test.describe('Data factories ↔ API contract', { tag: ['@regression', '@mutation', '@api'] }, () => {
  test.beforeEach(({ allowMutation }) => void allowMutation)

  test('customer', async ({ api }) => {
    const input = buildCustomer()
    expect(isValidThaiTaxId(input.tax_id)).toBe(true)
    // response คืนชื่อเป็น i18n object `name: { th, en }` (ไม่ใช่ name_th)
    const created = await api.create<{ code: string; name: { th: string } }>('/sales-bc/v1/customers', input)
    try {
      expect(created).toMatchObject({ code: input.code, name: { th: input.name_th } })
    } finally {
      await api.delete(`/sales-bc/v1/customers/${created.id}`)
    }
  })

  test('supplier', async ({ api }) => {
    const input = buildSupplier()
    const created = await api.create<{ code: string }>('/supplier-bc/v1/suppliers', input)
    try {
      expect(created.code).toBe(input.code)
    } finally {
      await api.delete(`/supplier-bc/v1/suppliers/${created.id}`)
    }
  })

  test('product', async ({ api }) => {
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

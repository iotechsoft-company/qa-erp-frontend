import { buildProduct } from '@data/factories'
import { expect, test } from '@fixtures/test'

import { cleanupOwned, withInventoryReferences } from './support'

// Products and bundles share their form fields and API DTO, but have separate UI routes.
for (const kind of ['single', 'bundle'] as const) {
  const emptyText = kind === 'single' ? 'ไม่พบรายการสินค้า' : 'ไม่พบรายการสินค้าชุด'
  const createdMessage = kind === 'single' ? 'สร้างรายการสินค้าเรียบร้อยแล้ว' : 'สร้างสินค้าชุดเรียบร้อยแล้ว'
  const updatedMessage = kind === 'single' ? 'แก้ไขรายการสินค้าเรียบร้อยแล้ว' : 'แก้ไขสินค้าชุดเรียบร้อยแล้ว'
  const deletedMessage = kind === 'single' ? 'ลบรายการสินค้าเรียบร้อยแล้ว' : 'ลบสินค้าชุดเรียบร้อยแล้ว'
  const confirmText = kind === 'single' ? 'ยืนยันการลบ' : 'ลบ'
  const bundleOnly = async (action: () => Promise<unknown>) => {
    if (kind === 'bundle') await action()
  }

  test.describe(`${kind} products`, { tag: '@inventory' }, () => {
    test('เปิด list และค้นหาแบบ read-only', { tag: '@smoke' }, async ({ productsPage, productGroupsPage }) => {
      const list = { single: productsPage, bundle: productGroupsPage }[kind]
      await list.goto()
      await expect(list.table.getByRole('columnheader', { name: 'รหัส SKU', exact: true })).toBeVisible()
      await list.expectSearchExisting('รหัส SKU')
      await list.search.search('E2E-NO-SUCH-PRODUCT-!')
      await expect(list.table.getByText(emptyText, { exact: true })).toBeVisible()
    })

    test('pagination และสถานะ sort ของตาราง', { tag: '@smoke' }, async ({ productsPage, productGroupsPage }) => {
      const list = { single: productsPage, bundle: productGroupsPage }[kind]
      await list.goto()
      await expect(list.table.getByRole('columnheader').getByRole('button')).toHaveCount(0)
      await list.dataTable.expectPagination(emptyText)
    })

    test('validation แสดงข้อความภาษาไทย', { tag: '@regression' }, async ({ productsPage, productGroupsPage, page }) => {
      const list = { single: productsPage, bundle: productGroupsPage }[kind]
      await list.goto()
      await list.openCreate()
      await list.save()
      await expect(page.getByText('กรุณาระบุชื่อสินค้าภาษาไทย', { exact: true })).toBeVisible()
      await expect(page.getByText('กรุณาเลือกกลุ่มสินค้า', { exact: true })).toBeVisible()
      await expect(page.getByText('กรุณาเลือกหน่วยนับสต็อกหลัก', { exact: true })).toBeVisible()
      await bundleOnly(() => list.notification.expectMessage('สินค้าชุดต้องมีสินค้าย่อยในชุดอย่างน้อย 1 รายการ'))
    })

    test(
      'create → list → edit → delete ผ่าน UI',
      { tag: ['@regression', '@mutation'] },
      async ({ allowMutation, api, productsPage, productGroupsPage }) => {
        void allowMutation
        const list = { single: productsPage, bundle: productGroupsPage }[kind]
        await withInventoryReferences(api, async (refs) => {
          const ids = { item_group_id: refs.item_group_id, stock_uom_id: refs.stock_uom_id }
          const input = buildProduct(ids, { type: kind })
          const component = buildProduct(ids)
          try {
            await bundleOnly(() => api.create('/inventory-bc/v1/products', component))
            await list.goto()
            await list.openCreate()
            await list.fill(input, refs)
            await bundleOnly(() => productGroupsPage.addComponent(component.sku!))
            await list.submit()
            await list.notification.expectMessage(createdMessage)
            await list.filter.apply(refs.itemGroup)
            await list.search.search(input.sku!)
            await expect(list.dataTable.row(input.sku!)).toContainText(input.name_th)
            await list.edit(input.sku!)
            await expect(list.nameTh).toHaveValue(input.name_th)
            const edited = `${input.name_th} รุ่นปรับปรุง`
            await list.nameTh.fill(edited)
            await list.submit(true)
            await list.notification.expectMessage(updatedMessage)
            await expect(list.dataTable.row(input.sku!)).toContainText(edited)
            await list.delete(input.sku!, confirmText)
            await list.notification.expectMessage(deletedMessage)
            await expect(list.dataTable.row(input.sku!)).toHaveCount(0)
            await expect
              .poll(() => api.list('/inventory-bc/v1/products', { filter: `sku||$eq||${input.sku}` }))
              .toEqual([])
          } finally {
            await cleanupOwned(api, 'products', 'sku', input.sku!)
            await cleanupOwned(api, 'products', 'sku', component.sku!)
          }
        })
      },
    )
  })
}

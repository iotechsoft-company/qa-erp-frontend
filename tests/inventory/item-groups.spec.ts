import { buildItemGroup } from '@data/factories'
import { expect, test } from '@fixtures/test'

import { cleanupOwned } from './support'

test.describe('Item groups', { tag: '@inventory' }, () => {
  test('เปิด list และค้นหาแบบ read-only', { tag: '@smoke' }, async ({ itemGroupsPage }) => {
    await itemGroupsPage.goto()
    await expect(itemGroupsPage.table.getByRole('columnheader', { name: 'ชื่อภาษาไทย', exact: true })).toBeVisible()
    await itemGroupsPage.expectSearchExisting('ชื่อภาษาไทย')
    await itemGroupsPage.search.search('E2E-NO-SUCH-GROUP-!')
    await expect(itemGroupsPage.table.getByText('ไม่พบรายการกลุ่มสินค้า', { exact: true })).toBeVisible()
  })

  test('pagination และสถานะ sort ของตาราง', { tag: '@smoke' }, async ({ itemGroupsPage }) => {
    await itemGroupsPage.goto()
    await expect(itemGroupsPage.table.getByRole('columnheader').getByRole('button')).toHaveCount(0)
    await itemGroupsPage.dataTable.expectPagination('ไม่พบรายการกลุ่มสินค้า')
  })

  test('validation ชื่อกลุ่มสินค้าภาษาไทย', { tag: '@regression' }, async ({ itemGroupsPage, page }) => {
    await itemGroupsPage.goto()
    await itemGroupsPage.openCreate()
    await itemGroupsPage.save()
    await expect(page.getByText('กรุณาระบุชื่อกลุ่มสินค้าภาษาไทย', { exact: true })).toBeVisible()
  })

  test(
    'create → list → edit → delete ผ่าน UI',
    { tag: ['@regression', '@mutation'] },
    async ({ allowMutation, api, itemGroupsPage }) => {
      void allowMutation
      const input = buildItemGroup()
      try {
        await itemGroupsPage.goto()
        await itemGroupsPage.openCreate()
        await itemGroupsPage.fillForm(input)
        await itemGroupsPage.submit()
        await itemGroupsPage.notification.expectMessage('สร้างกลุ่มสินค้าเรียบร้อยแล้ว')
        await itemGroupsPage.search.search(input.name_th)
        await expect(itemGroupsPage.dataTable.row(input.name_th)).toBeVisible()
        await itemGroupsPage.edit(input.name_th)
        await expect(itemGroupsPage.nameTh).toHaveValue(input.name_th)
        await itemGroupsPage.nameEn.fill('Office stationery revised')
        const updated = await itemGroupsPage.submit(true)
        expect(updated.request().postDataJSON()).toMatchObject({ name_en: 'Office stationery revised' })
        expect((await updated.json()).data.attributes.name.en).toBe('Office stationery revised')
        await itemGroupsPage.notification.expectMessage('แก้ไขกลุ่มสินค้าเรียบร้อยแล้ว')
        await expect(itemGroupsPage.dataTable.row(input.name_th)).toContainText('Office stationery revised')
        await itemGroupsPage.delete(input.name_th)
        await itemGroupsPage.notification.expectMessage('ลบกลุ่มสินค้าเรียบร้อยแล้ว')
        await expect(itemGroupsPage.dataTable.row(input.name_th)).toHaveCount(0)
        await expect
          .poll(() => api.list('/inventory-bc/v1/item-groups', { filter: `name_th||$eq||${input.name_th}` }))
          .toEqual([])
      } finally {
        await cleanupOwned(api, 'item-groups', 'name_th', input.name_th)
      }
    },
  )
})

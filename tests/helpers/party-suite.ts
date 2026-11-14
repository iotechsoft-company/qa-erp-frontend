import { type ApiClient } from '@api/api-client'
import { expect, test } from '@fixtures/test'
import { type PartyInput } from '@pages/party-list.page'

type PartySuite = {
  title: string
  tag: string
  fixture: 'customersPage' | 'purchasersPage'
  entity: string
  typeField: 'customer_type' | 'supplier_type'
  codeTooLongText: string
  endpoint: string
  factory: (type: 'company' | 'individual') => PartyInput
}

export async function cleanupParty(api: ApiClient, endpoint: string, code: string) {
  if (!code.startsWith('E2E-')) throw new Error('Refusing cleanup of non-E2E data')
  const rows = await api.list<{ code: string }>(endpoint, { filter: `code||$eq||${code}`, ignore_limit: 'true' })
  for (const row of rows) if (row.code === code) await api.delete(`${endpoint}/${row.id}`)
}

export function registerPartySuite(config: PartySuite) {
  test.describe(config.title, { tag: `@${config.tag}` }, () => {
    test('เปิด list ค้นหารหัสที่มีอยู่และคำที่ไม่พบ', { tag: '@smoke' }, async ({ customersPage, purchasersPage }) => {
      const list = { customersPage, purchasersPage }[config.fixture]
      await list.goto()
      await expect(list.table.getByRole('columnheader', { name: list.codeColumn, exact: true })).toBeVisible()
      await list.expectSearchExisting()
      await list.search.search('E2E-NO-MATCH-!')
      await expect(list.table.getByText(list.emptyText, { exact: true })).toBeVisible()
    })

    test('pagination และสถานะ sort ของตาราง', { tag: '@smoke' }, async ({ customersPage, purchasersPage }) => {
      const list = { customersPage, purchasersPage }[config.fixture]
      await list.goto()
      await expect(list.table.getByRole('columnheader').getByRole('button')).toHaveCount(0)
      await list.expectPagination()
    })

    test('validation ช่องบังคับเป็นภาษาไทย', { tag: '@regression' }, async ({ customersPage, purchasersPage, page }) => {
      const list = { customersPage, purchasersPage }[config.fixture]
      await list.goto()
      await list.openCreate()
      await list.save()
      await expect(page.getByText(`กรุณาระบุรหัส${config.entity}`, { exact: true })).toBeVisible()
      await expect(page.getByText(`กรุณาระบุชื่อ${config.entity}ภาษาไทย`, { exact: true })).toBeVisible()
      await expect(page.getByText('กรุณาระบุเลขประจำตัวผู้เสียภาษี', { exact: true })).toBeVisible()
    })

    test(
      'validation ความยาวชื่อ เลขภาษี และเบอร์โทร',
      { tag: '@regression' },
      async ({ customersPage, purchasersPage, page }) => {
        const list = { customersPage, purchasersPage }[config.fixture]
        const input = config.factory('company')
        await list.goto()
        await list.openCreate()
        await list.fillForm(input)
        await list.code.fill(`E2E-${'A'.repeat(47)}`)
        await list.nameTh.fill('ก'.repeat(256))
        await list.taxId.fill('1'.repeat(21))
        await list.phone.fill('1'.repeat(31))
        await list.save()
        await expect(page.getByText(config.codeTooLongText, { exact: true })).toBeVisible()
        await expect(page.getByText('ชื่อต้องไม่เกิน 255 ตัวอักษร', { exact: true })).toBeVisible()
        await expect(page.getByText('เลขประจำตัวผู้เสียภาษีต้องไม่เกิน 20 ตัวอักษร', { exact: true })).toBeVisible()
        await expect(page.getByText('เบอร์โทรต้องไม่เกิน 30 ตัวอักษร', { exact: true })).toBeVisible()
      },
    )

    for (const type of ['company', 'individual'] as const) {
      test(
        `CRUD ${type}: create → list → edit → delete ผ่าน UI`,
        { tag: ['@regression', '@mutation'] },
        async ({ allowMutation, api, customersPage, purchasersPage }) => {
          void allowMutation
          const list = { customersPage, purchasersPage }[config.fixture]
          const input = config.factory(type)
          try {
            await list.goto()
            await list.openCreate()
            await list.fillForm(input)
            const id = await list.submit()
            await list.notification.expectMessage(`สร้างข้อมูล${config.entity}เรียบร้อยแล้ว`)
            await list.search.search(input.code)
            await expect(list.dataTable.row(input.code)).toContainText(input.name_th)
            const created = await api.get<{ data: { attributes: Record<string, unknown> } }>(`${config.endpoint}/${id}`)
            expect(created.data.attributes).toMatchObject({
              [config.typeField]: type,
              credit_terms: input.credit_terms,
              code: input.code,
              name: { th: input.name_th },
              tax_id: input.tax_id,
              is_vat_registered: input.is_vat_registered,
              is_active: true,
            })
            await list.edit(input.code)
            await expect(list.nameTh).toHaveValue(input.name_th)
            await expect(list.taxId).toHaveValue(input.tax_id)
            await expect(list.phone).toHaveValue(input.contact_phone ?? '')
            await expect(list.address).toHaveValue(input.address ?? '')
            await expect(list.vatRegistered).toBeChecked({ checked: input.is_vat_registered ?? true })
            const editedName = `${input.name_th} สาขาบางนา`
            await list.nameTh.fill(editedName)
            await list.active.uncheck()
            await list.submit(true)
            await list.notification.expectMessage(`แก้ไขข้อมูล${config.entity}เรียบร้อยแล้ว`)
            await expect(list.dataTable.row(input.code)).toContainText(editedName)
            await expect(list.dataTable.row(input.code).getByText('ปิดใช้งาน', { exact: true })).toBeVisible()
            const updated = await api.get<{ data: { attributes: { name: { th: string }; is_active: boolean } } }>(
              `${config.endpoint}/${id}`,
            )
            expect(updated.data.attributes).toMatchObject({ name: { th: editedName }, is_active: false })
            await list.delete(input.code)
            await expect.poll(() => api.list(config.endpoint, { filter: `code||$eq||${input.code}` })).toEqual([])
          } finally {
            await cleanupParty(api, config.endpoint, input.code)
          }
        },
      )
    }

    test(
      'ยกเลิก dialog ลบแล้วข้อมูลยังอยู่',
      { tag: ['@regression', '@mutation'] },
      async ({ allowMutation, api, customersPage, purchasersPage }) => {
        void allowMutation
        const input = config.factory('company')
        const list = { customersPage, purchasersPage }[config.fixture]
        try {
          const created = await api.create(config.endpoint, input)
          await list.goto()
          await list.search.search(input.code)
          await list.openDelete(input.code)
          await list.confirmDialog.cancel()
          await expect(list.dataTable.row(input.code)).toBeVisible()
          const fetched = await api.get<{ data: { id: string } }>(`${config.endpoint}/${created.id}`)
          expect(fetched.data.id).toBe(created.id)
        } finally {
          await cleanupParty(api, config.endpoint, input.code)
        }
      },
    )
  })
}

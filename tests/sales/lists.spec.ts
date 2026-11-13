import { expect, test } from '@fixtures/test'
const lists = ['quotationsPage', 'salesOrdersPage', 'deliveryNotesPage'] as const
for (const key of lists) {
  test.describe(`${key}`, { tag: ['@sales', '@smoke'] }, () => {
    test(
      'known bug #2: ค้นหาส่ง $contL และ API reject operator ตรงสาเหตุ',
      {
        annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/2' },
      },
      async ({ quotationsPage, salesOrdersPage, deliveryNotesPage }) => {
        const list = { quotationsPage, salesOrdersPage, deliveryNotesPage }[key]
        await list.goto()
        const search = 'E2E-NO-SUCH-DOCUMENT-!'
        const response = await list.searchResponse(search)
        const query = new URL(response.url()).searchParams.get('s')!
        expect(JSON.parse(query)).toEqual({ [list.config.numberField]: { $contL: search } })
        expect(response.status()).toBe(400)
        expect(await response.json()).toMatchObject({
          status: { code: 400002 },
          errors: [
            {
              code: 'INVALID_PARAMETER_FORMAT',
              detail: expect.stringContaining("Invalid search operator: '$contL'"),
              source: { parameter: 's' },
            },
          ],
        })
      },
    )

    test('เปิด list และกรองสถานะยกเลิก', async ({ quotationsPage, salesOrdersPage, deliveryNotesPage }) => {
      const list = { quotationsPage, salesOrdersPage, deliveryNotesPage }[key]
      await list.goto()
      await list.filterStatus('ยกเลิกแล้ว', 'CANCELLED')
      await expect(list.pageStatusFilter()).toContainText('ยกเลิกแล้ว')
    })

    test('pagination และสถานะ sort', async ({ quotationsPage, salesOrdersPage, deliveryNotesPage }) => {
      const list = { quotationsPage, salesOrdersPage, deliveryNotesPage }[key]
      await list.goto()
      await expect(list.table.getByRole('columnheader').getByRole('button')).toHaveCount(0)
      await list.expectPagination()
    })
  })
}

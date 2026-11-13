import { expect, test } from '@fixtures/test'
const lists = ['quotationsPage', 'salesOrdersPage', 'deliveryNotesPage'] as const
for (const key of lists) {
  test.describe(`${key}`, { tag: ['@sales', '@smoke'] }, () => {
    test(
      'ค้นหาเลขเอกสารแสดงผลถูกต้อง',
      {
        annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/2' },
      },
      async ({ quotationsPage, salesOrdersPage, deliveryNotesPage }) => {
        test.fail(true, 'erp-frontend#2 — unsupported $contL search operator')
        const list = { quotationsPage, salesOrdersPage, deliveryNotesPage }[key]
        await list.goto()
        await list.search('E2E-NO-SUCH-DOCUMENT-!')
        await expect(list.table.getByText(list.config.empty, { exact: true })).toBeVisible()
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

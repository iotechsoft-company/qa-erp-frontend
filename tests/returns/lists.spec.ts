import { expect, test } from '@fixtures/test'

test.describe('Return list API smoke', { tag: ['@returns', '@api', '@smoke'] }, () => {
  for (const resource of ['purchase', 'sales'] as const) {
    const paths = { purchase: '/inventory-bc/v1/purchase-returns', sales: '/sales-bc/v1/sales-returns' }
    const fields = { purchase: 'prn_number', sales: 'srn_number' }

    test(`${resource}: bounded read-only collection exposes return number/reason/state`, async ({ api }) => {
      const rows = await api.list<Record<string, unknown>>(paths[resource], {
        limit: 2,
        page: 1,
        sort: 'created_at:DESC',
      })
      expect(rows.length).toBeLessThanOrEqual(2)
      for (const row of rows) {
        expect(row.id).toEqual(expect.any(String))
        expect(row[fields[resource]]).toEqual(expect.any(String))
        expect(row.return_reason).toEqual(expect.any(String))
        expect(row.status).toMatch(/^(DRAFT|SUBMITTED|CANCELLED)$/)
      }
    })
  }
})

import { SETTLEMENT_RESOURCES } from '@data/settlement-cleanup'
import { expect, test } from '@fixtures/test'

test.describe(
  'Settlement collections (read-only API smoke)',
  { tag: ['@finance', '@settlements', '@api', '@smoke'] },
  () => {
    for (const resource of SETTLEMENT_RESOURCES) {
      test(`${resource}: bounded collection exposes legal state`, async ({ api }) => {
        const rows = await api.list<{ status: string }>(`/finance-bc/v1/${resource}`, {
          limit: 2,
          page: 1,
          sort: 'created_at:DESC',
        })
        expect(rows.length).toBeLessThanOrEqual(2)
        for (const row of rows) {
          expect(row.id).toEqual(expect.any(String))
          expect(row.status).toMatch(/^(DRAFT|ISSUED|SUBMITTED|CANCELLED)$/)
        }
      })
    }
  },
)

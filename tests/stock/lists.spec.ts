import { expect, test } from '@fixtures/test'

test.describe('Stock API lists (UI absent)', { tag: ['@smoke', '@api', '@stock', '@inventory'] }, () => {
  for (const [resource, number] of [
    ['stock-entries', 'entry_number'],
    ['stock-adjustments', 'adjustment_number'],
  ] as const) {
    test(`${resource}: bounded read-only list exposes document identity and state`, async ({ api }) => {
      const rows = await api.list<Record<string, unknown>>(`/inventory-bc/v1/${resource}`, {
        page: 1,
        limit: 2,
        sort: 'created_at:DESC',
      })
      expect(rows.length).toBeLessThanOrEqual(2)
      for (const row of rows) {
        expect(row.id).toEqual(expect.any(String))
        expect(row[number]).toEqual(expect.any(String))
        expect(row.status).toMatch(/^(DRAFT|PENDING_APPROVAL|SUBMITTED|CANCELLED)$/)
      }
    })
  }
})

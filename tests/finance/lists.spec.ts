import { expect, test } from '@fixtures/test'

test.describe('Finance document collections (read-only API smoke)', { tag: ['@finance', '@api', '@smoke'] }, () => {
  for (const resource of ['ap-invoices', 'receipts'] as const) {
    test(`${resource}: bounded list exposes document type and valid state`, async ({ api }) => {
      const rows = await api.list<{ status: string; document_type: string; document_number: string | null }>(
        `/finance-bc/v1/${resource}`,
        { limit: 2, page: 1, sort: 'created_at:DESC' },
      )
      expect(rows.length).toBeLessThanOrEqual(2)
      for (const row of rows) {
        expect(row.id).toEqual(expect.any(String))
        expect(row.document_type).toEqual(expect.any(String))
        expect(row.status).toMatch(/^(DRAFT|SUBMITTED|CANCELLED|ISSUED|VOID)$/)
      }
    })
  }
})

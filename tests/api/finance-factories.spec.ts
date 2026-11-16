import { FinanceScenario } from '@api/finance-scenario'
import { expect, test } from '@fixtures/test'

test.describe('Finance factories ↔ DTO (API path)', { tag: ['@finance', '@api', '@regression', '@mutation'] }, () => {
  for (const kind of ['ap', 'ar'] as const) {
    test(`${kind}: draft create/read/delete leaves stock and GL unchanged`, async ({ allowMutation, api }) => {
      void allowMutation
      const s = new FinanceScenario(api, kind)
      try {
        await s.seed()
        const before = await s.source.snapshot()
        const draft = await s.create()
        expect(draft.status).toBe('DRAFT')
        expect(draft.remark.th).toContain(s.marker)
        expect(draft.items[0]).toMatchObject({ product_id: s.productId, qty: 1 })
        expect(await s.ledger(draft.id)).toEqual([])
        expect(await s.source.snapshot()).toEqual(before)
        await api.delete(`${s.path}/${draft.id}`)
        expect(await api.list(s.path, { filter: `id||$eq||${draft.id}` })).toEqual([])
      } finally {
        await s.cleanup()
      }
    })

    test(
      `${kind}: draft update persists remark without posting`,
      {
        annotation:
          kind === 'ar'
            ? { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-api/issues/14' }
            : { type: 'contract', description: 'AP draft update remains active; no failed write is retried' },
      },
      async ({ allowMutation, api }) => {
        test.fixme(
          kind === 'ar',
          'erp-api#14: receipt PUT returned 404 after POST/GET; initial + 1/3 independent repeats',
        )
        void allowMutation
        const s = new FinanceScenario(api, kind)
        try {
          await s.seed()
          const doc = await s.create()
          const remark = `${s.marker} แก้ไขหมายเหตุ`
          await api.put(`${s.path}/${doc.id}`, { remark_th: remark })
          expect((await s.read(doc.id)).remark.th).toBe(remark)
          expect(await s.ledger(doc.id)).toEqual([])
        } finally {
          await s.cleanup()
        }
      },
    )
  }
})

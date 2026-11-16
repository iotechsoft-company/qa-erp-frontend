import { ReturnScenario } from '@api/return-scenario'
import { expect, test } from '@fixtures/test'

test.describe('Return factory contracts', { tag: ['@returns', '@api', '@regression', '@mutation'] }, () => {
  for (const kind of ['purchase', 'sales'] as const) {
    for (const operation of ['create/read/delete', 'update'] as const) {
      const exercise = {
        'create/read/delete': async (s: ReturnScenario, id: string) => {
          await s.api.delete(`${s.path}/${id}`)
          expect(await s.api.list(s.path, { filter: `id||$eq||${id}` })).toEqual([])
        },
        update: async (s: ReturnScenario, id: string) => {
          const remark = `${s.marker} ปรับหมายเหตุคืนสินค้า`
          await s.api.put(`${s.path}/${id}`, { remark_th: remark })
          expect((await s.read(id)).remark?.th).toBe(remark)
        },
      }

      test(
        `${kind}: draft ${operation}`,
        { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-api/issues/14' } },
        async ({ allowMutation, api }) => {
          test.fixme(
            kind === 'sales' && operation === 'update',
            'erp-api#14: observed return PUT 404 after POST/GET; no write retry',
          )
          void allowMutation
          const s = new ReturnScenario(api, kind)
          try {
            await s.seed()
            const before = await s.snapshot()
            const draft = await s.create(2)
            expect(draft).toMatchObject({
              status: 'DRAFT',
              return_reason: s.input().return_reason,
              items: [
                expect.objectContaining({
                  qty: 2,
                  product_id: s.productId,
                  line_total: kind === 'purchase' ? 80 : 300,
                }),
              ],
            })
            await exercise[operation](s, draft.id)
            expect(await s.snapshot()).toEqual(before)
          } finally {
            await s.cleanup()
          }
        },
      )
    }
  }
})

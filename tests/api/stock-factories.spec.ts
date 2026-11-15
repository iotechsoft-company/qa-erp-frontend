import { StockScenario } from '@api/stock-scenario'
import { expect, test } from '@fixtures/test'

test.describe(
  'Stock factories ↔ DTO contracts (API path; no D1/D2 UI exists)',
  { tag: ['@api', '@inventory', '@stock', '@regression', '@mutation'] },
  () => {
    for (const type of ['MATERIAL_RECEIPT', 'MATERIAL_ISSUE', 'MATERIAL_TRANSFER', 'REPACK'] as const) {
      test(`${type}: draft create/read/delete leaves stock unchanged`, async ({ allowMutation, api }) => {
        void allowMutation
        const s = new StockScenario(api)
        try {
          await s.seed()
          const receipt = await s.receipt()
          const inputs = {
            MATERIAL_RECEIPT: s.receiptInput(),
            MATERIAL_ISSUE: s.issueInput(),
            MATERIAL_TRANSFER: s.transferInput(receipt.items[0]!.target_lot_id!),
            REPACK: s.repackInput(),
          }
          const before = await s.snapshot()
          const created = await s.createEntry(inputs[type])
          expect(created).toMatchObject({ status: 'DRAFT', entry_type: type, remark: { th: inputs[type].remark_th } })
          await api.delete(`/inventory-bc/v1/stock-entries/${created.id}`)
          expect(await api.list('/inventory-bc/v1/stock-entries', { filter: `id||$eq||${created.id}` })).toEqual([])
          expect(await s.snapshot()).toEqual(before)
        } finally {
          await s.cleanup()
        }
      })
    }

    test('counted quantity draft create/read/delete preserves stock', async ({ allowMutation, api }) => {
      void allowMutation
      const s = new StockScenario(api)
      try {
        await s.seed()
        const receipt = await s.receipt()
        const before = await s.snapshot()
        const draft = await s.createAdjustment(receipt.items[0]!.target_lot_id!, 8)
        expect(draft.items).toEqual([expect.objectContaining({ counted_qty: 8, system_qty: 10, qty: -2 })])
        await api.delete(`/inventory-bc/v1/stock-adjustments/${draft.id}`)
        expect(await api.list('/inventory-bc/v1/stock-adjustments', { filter: `id||$eq||${draft.id}` })).toEqual([])
        expect(await s.snapshot()).toEqual(before)
      } finally {
        await s.cleanup()
      }
    })
  },
)

for (const resource of ['stock-entries', 'stock-adjustments'] as const) {
  test(
    `${resource}: draft update`,
    { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-api/issues/14' } },
    async ({ allowMutation, api }) => {
      test.fixme(true, 'erp-api#14: intermittent PUT 404 after POST and successful GET; never retry writes')
      void allowMutation
      const s = new StockScenario(api)
      try {
        await s.seed()
        const receipt = await s.receipt()
        const create = {
          'stock-entries': () => s.createEntry(),
          'stock-adjustments': () => s.createAdjustment(receipt.items[0]!.target_lot_id!, 8),
        }
        const draft = await create[resource]()
        const remark = `${s.marker} ปรับหมายเหตุเอกสาร`
        await api.put(`/inventory-bc/v1/${resource}/${draft.id}`, { remark_th: remark })
        expect((await s.read(resource, draft.id)).remark?.th).toBe(remark)
      } finally {
        await s.cleanup()
      }
    },
  )
}

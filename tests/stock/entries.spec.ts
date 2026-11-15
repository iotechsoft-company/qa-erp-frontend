import { StockScenario } from '@api/stock-scenario'
import { expect, test } from '@fixtures/test'
import { expectPosting, quantity, reject, zeroNetMovements } from './support'

test.describe(
  'D1 stock entries (API path; no D1 UI exists)',
  { tag: ['@stock', '@inventory', '@regression', '@mutation'] },
  () => {
    for (const type of ['MATERIAL_RECEIPT', 'MATERIAL_ISSUE', 'MATERIAL_TRANSFER', 'REPACK'] as const) {
      test(`${type}: draft → submit → quantities/cost/ledger → cancel restores baseline`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new StockScenario(api)
        try {
          await s.seed()
          const receipt = await s.receipt(10, 12.5)
          const lot = receipt.items[0]!.target_lot_id!
          const input = {
            MATERIAL_RECEIPT: s.receiptInput(4, 12.5),
            MATERIAL_ISSUE: s.issueInput(3),
            MATERIAL_TRANSFER: s.transferInput(lot, 2),
            REPACK: s.repackInput(),
          }
          const before = await s.snapshot()
          const draft = await s.createEntry(input[type])
          expect(draft.status).toBe('DRAFT')
          expect(await s.snapshot()).toEqual(before)
          const submitted = await s.action('stock-entries', draft.id, 'submit')
          expect(submitted.status).toBe('SUBMITTED')
          await expectPosting(s, submitted, lot)
          const after = await s.snapshot()
          await reject(
            await api.postResponse(`/inventory-bc/v1/stock-entries/${draft.id}/submit`, {}),
            409,
            `Stock entry '${draft.id}' cannot move from SUBMITTED to SUBMITTED.`,
          )
          expect(await s.snapshot()).toEqual(after)
          await s.action('stock-entries', draft.id, 'cancel')
          await quantity(s, 10)
          await quantity(s, 0, s.productId, s.destinationWarehouseId)
          await quantity(s, 0, s.secondProductId)
          await zeroNetMovements(s, draft.id)
          const cancelled = await s.snapshot()
          await reject(
            await api.postResponse(`/inventory-bc/v1/stock-entries/${draft.id}/cancel`, {
              cancel_reason: `${s.marker} ยกเลิกซ้ำ`,
            }),
            409,
            `Stock entry '${draft.id}' cannot move from CANCELLED to CANCELLED.`,
          )
          expect(await s.snapshot()).toEqual(cancelled)
        } finally {
          await s.cleanup()
        }
      })
    }
    for (const type of ['MATERIAL_RECEIPT', 'MATERIAL_TRANSFER', 'REPACK'] as const) {
      test(`${type}: consumed destination rejects cancellation atomically`, async ({ allowMutation, api }) => {
        void allowMutation
        const s = new StockScenario(api)
        try {
          await s.seed()
          const seed = await s.receipt(10, 12.5)
          const input = {
            MATERIAL_RECEIPT: s.receiptInput(4, 12.5),
            MATERIAL_TRANSFER: s.transferInput(seed.items[0]!.target_lot_id!, 2),
            REPACK: s.repackInput(),
          }
          const target = await s.createEntry(input[type])
          const submitted = await s.action('stock-entries', target.id, 'submit')
          const setups = {
            MATERIAL_RECEIPT: async () => {
              // FIFO would consume the older seed lot. Consume it first, then exactly one new unit.
              const issue = await s.createEntry(s.issueInput(11))
              await s.action('stock-entries', issue.id, 'submit')
              return { issue, lotId: submitted.items[0]!.target_lot_id!, suffix: 'cannot cancel this stock entry.' }
            },
            MATERIAL_TRANSFER: async () => {
              const issue = await s.createEntry(s.issueInput(1, s.productId, s.destinationWarehouseId))
              await s.action('stock-entries', issue.id, 'submit')
              return { issue, lotId: submitted.items[0]!.target_lot_id!, suffix: 'cannot cancel this transfer.' }
            },
            REPACK: async () => {
              const issue = await s.createEntry(s.issueInput(1, s.secondProductId))
              await s.action('stock-entries', issue.id, 'submit')
              return {
                issue,
                lotId: submitted.items.find((i) => i.product_id === s.secondProductId)!.target_lot_id!,
                suffix: 'cannot cancel this Repack.',
              }
            },
          }
          const { issue, lotId, suffix } = await setups[type]()
          const lot = (await s.lots()).find((row) => row.id === lotId)!
          const detail = {
            MATERIAL_RECEIPT: `Lot '${lotId}' (lot_number '${lot.lot_number}') has already been partially consumed — ${suffix}`,
            MATERIAL_TRANSFER: `Lot '${lotId}' (lot_number '${lot.lot_number}') at the destination has already been partially consumed — ${suffix}`,
            REPACK: `Lot '${lotId}' (lot_number '${lot.lot_number}') has already been partially consumed — ${suffix}`,
          }[type]
          const before = await s.snapshot()
          await reject(
            await api.postResponse(`/inventory-bc/v1/stock-entries/${target.id}/cancel`, {
              cancel_reason: `${s.marker} ล็อตถูกใช้แล้ว`,
            }),
            409,
            detail,
          )
          expect((await s.read('stock-entries', target.id)).status).toBe('SUBMITTED')
          expect(await s.snapshot()).toEqual(before)
          await s.action('stock-entries', issue.id, 'cancel')
          await s.action('stock-entries', target.id, 'cancel')
          await quantity(s, 10)
        } finally {
          await s.cleanup()
        }
      })
    }

    test('invalid warehouse/line shape and shortage do not create movements', async ({ allowMutation, api }) => {
      void allowMutation
      const s = new StockScenario(api)
      try {
        await s.seed()
        const before = await s.snapshot()
        const invalid = s.receiptInput()
        delete invalid.to_warehouse_id
        await reject(
          await api.postResponse('/inventory-bc/v1/stock-entries', invalid),
          400,
          'to_warehouse_id is required for entry_type=MATERIAL_RECEIPT.',
          'BAD_REQUEST',
        )
        const draft = await s.createEntry(s.issueInput())
        await reject(
          await api.postResponse(`/inventory-bc/v1/stock-entries/${draft.id}/submit`, {}),
          409,
          `Insufficient stock for product '${s.productId}' in warehouse '${s.warehouseId}': requested 1, available 0.`,
          'INSUFFICIENT_STOCK',
        )
        expect((await s.read('stock-entries', draft.id)).status).toBe('DRAFT')
        expect(await s.snapshot()).toEqual(before)
      } finally {
        await s.cleanup()
      }
    })
  },
)

import { StockScenario } from '@api/stock-scenario'
import { expect, test } from '@fixtures/test'
import { quantity, reject, zeroNetMovements } from './support'

async function threshold(s: StockScenario) {
  const settings = await s.api.get<{ data: { attributes: { adjustment_approval_threshold: number | null } } }>(
    '/inventory-bc/v1/stock-settings',
  )
  const value = settings.data.attributes.adjustment_approval_threshold
  expect(value, 'dev approval threshold must be enabled; never change shared settings').toEqual(expect.any(Number))
  expect(value!).toBeGreaterThanOrEqual(2)
  return value!
}

test.describe(
  'D2 physical stock count (API path; no D2 UI exists)',
  { tag: ['@stock', '@inventory', '@regression', '@mutation'] },
  () => {
    test('counted qty below threshold → delta/ledger and cancellation restore baseline', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new StockScenario(api)
      try {
        await s.seed()
        const limit = await threshold(s)
        const receipt = await s.receipt()
        const lot = receipt.items[0]!.target_lot_id!
        const before = await s.snapshot()
        const draft = await s.createAdjustment(lot, 8)
        expect(await s.snapshot()).toEqual(before)
        await reject(
          await api.postResponse(`/inventory-bc/v1/stock-adjustments/${draft.id}/approve`, {}),
          409,
          `Stock adjustment '${draft.id}' is DRAFT — only one held for approval can be approved.`,
        )
        expect(await s.snapshot()).toEqual(before)
        const submitted = await s.action('stock-adjustments', draft.id, 'submit')
        expect(submitted).toMatchObject({
          status: 'SUBMITTED',
          approval_threshold_snapshot: limit,
          adjustment_value_snapshot: 2,
          items: [expect.objectContaining({ counted_qty: 8, system_qty: 10, qty: -2 })],
        })
        await quantity(s, 8)
        expect((await s.movements()).filter((row) => row.source_doc_id === draft.id)).toEqual([
          expect.objectContaining({
            type: 'ADJUSTMENT',
            source_doc_type: 'STOCK_ADJUSTMENT',
            lot_id: lot,
            qty: -2,
            unit_cost: 1,
          }),
        ])
        const after = await s.snapshot()
        await reject(
          await api.postResponse(`/inventory-bc/v1/stock-adjustments/${draft.id}/submit`, {}),
          409,
          `Stock adjustment '${draft.id}' cannot move from SUBMITTED to SUBMITTED.`,
        )
        expect(await s.snapshot()).toEqual(after)
        await s.action('stock-adjustments', draft.id, 'cancel')
        await quantity(s, 10)
        await zeroNetMovements(s, draft.id)
        const cancelled = await s.snapshot()
        await reject(
          await api.postResponse(`/inventory-bc/v1/stock-adjustments/${draft.id}/cancel`, {
            cancel_reason: `${s.marker} ยกเลิกซ้ำ`,
          }),
          409,
          `Stock adjustment '${draft.id}' cannot move from CANCELLED to CANCELLED.`,
        )
        expect(await s.snapshot()).toEqual(cancelled)
      } finally {
        await s.cleanup()
      }
    })

    test('above threshold holds all stock; approval re-reads moved lot; reversal uses approval-time baseline', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new StockScenario(api)
      try {
        await s.seed()
        const limit = await threshold(s)
        const receipt = await s.receipt()
        const lot = receipt.items[0]!.target_lot_id!
        const counted = 10 + limit + 1
        const draft = await s.createAdjustment(lot, counted)
        const before = await s.snapshot()
        const held = await s.action('stock-adjustments', draft.id, 'submit')
        expect(held).toMatchObject({
          status: 'PENDING_APPROVAL',
          approval_threshold_snapshot: limit,
          adjustment_value_snapshot: limit + 1,
        })
        expect(await s.snapshot()).toEqual(before)
        const issue = await s.createEntry(s.issueInput())
        await s.action('stock-entries', issue.id, 'submit')
        await quantity(s, 9)
        const approved = await s.action('stock-adjustments', draft.id, 'approve')
        expect(approved).toMatchObject({
          status: 'SUBMITTED',
          adjustment_value_snapshot: limit + 1,
          items: [expect.objectContaining({ counted_qty: counted, system_qty: 9, qty: counted - 9 })],
        })
        await quantity(s, counted)
        expect((await s.movements()).filter((row) => row.source_doc_id === draft.id)).toEqual([
          expect.objectContaining({ lot_id: lot, qty: counted - 9, unit_cost: 1 }),
        ])
        await s.action('stock-adjustments', draft.id, 'cancel')
        await quantity(s, 9)
        await zeroNetMovements(s, draft.id)
        await s.action('stock-entries', issue.id, 'cancel')
        await quantity(s, 10)
      } finally {
        await s.cleanup()
      }
    })

    test('absolute per-lot value triggers approval even when net qty/value is zero', async ({ allowMutation, api }) => {
      void allowMutation
      const s = new StockScenario(api)
      try {
        await s.seed()
        const limit = await threshold(s)
        const base = limit + 1
        const delta = Math.floor(limit / 2) + 1
        const first = await s.receipt(base, 1)
        const second = await s.receipt(base, 1)
        const firstLot = first.items[0]!.target_lot_id!
        const secondLot = second.items[0]!.target_lot_id!
        const input = s.adjustmentInput(firstLot, base + delta)
        input.items.push({ lot_id: secondLot, counted_qty: base - delta })
        const created = await api.create('/inventory-bc/v1/stock-adjustments', input)
        const draft = await s.visible('stock-adjustments', created.id)
        const before = await s.snapshot()
        const held = await s.action('stock-adjustments', draft.id, 'submit')
        expect(held).toMatchObject({ status: 'PENDING_APPROVAL', adjustment_value_snapshot: delta * 2 })
        expect(await s.snapshot()).toEqual(before)
        await s.action('stock-adjustments', draft.id, 'approve')
        await quantity(s, base * 2)
        expect((await s.lots()).find((lot) => lot.id === firstLot)!.available_qty).toBe(base + delta)
        expect((await s.lots()).find((lot) => lot.id === secondLot)!.available_qty).toBe(base - delta)
        await s.action('stock-adjustments', draft.id, 'cancel')
        await zeroNetMovements(s, draft.id)
        expect(
          (await s.lots()).filter((lot) => [firstLot, secondLot].includes(lot.id)).map((lot) => lot.available_qty),
        ).toEqual([base, base])
      } finally {
        await s.cleanup()
      }
    })

    test('changed lot blocks adjustment cancellation with exact conflict and no side effects', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new StockScenario(api)
      try {
        await s.seed()
        await threshold(s)
        const receipt = await s.receipt()
        const lotId = receipt.items[0]!.target_lot_id!
        const draft = await s.createAdjustment(lotId, 8)
        await s.action('stock-adjustments', draft.id, 'submit')
        const issue = await s.createEntry(s.issueInput())
        await s.action('stock-entries', issue.id, 'submit')
        const lot = (await s.lots()).find((row) => row.id === lotId)!
        const before = await s.snapshot()
        await reject(
          await api.postResponse(`/inventory-bc/v1/stock-adjustments/${draft.id}/cancel`, {
            cancel_reason: `${s.marker} ล็อตขยับแล้ว`,
          }),
          409,
          `Lot '${lotId}' (lot_number '${lot.lot_number}') has changed since this adjustment was submitted (available_qty=7, expected 8) — cannot cancel. Submit a new stock adjustment instead.`,
        )
        expect((await s.read('stock-adjustments', draft.id)).status).toBe('SUBMITTED')
        expect(await s.snapshot()).toEqual(before)
        await s.action('stock-entries', issue.id, 'cancel')
        await s.action('stock-adjustments', draft.id, 'cancel')
        await quantity(s, 10)
      } finally {
        await s.cleanup()
      }
    })

    test(
      'known bug #18: cancelling held adjustment rejects without moving stock',
      { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-api/issues/18' } },
      async ({ allowMutation, api }) => {
        void allowMutation
        const s = new StockScenario(api)
        try {
          await s.seed()
          const limit = await threshold(s)
          const receipt = await s.receipt()
          const draft = await s.createAdjustment(receipt.items[0]!.target_lot_id!, 10 + limit + 1)
          const held = await s.action('stock-adjustments', draft.id, 'submit')
          expect(held.status).toBe('PENDING_APPROVAL')
          const before = await s.snapshot()
          const lotId = receipt.items[0]!.target_lot_id!
          const lot = (await s.lots()).find((row) => row.id === lotId)!
          await reject(
            await api.postResponse(`/inventory-bc/v1/stock-adjustments/${draft.id}/cancel`, {
              cancel_reason: `${s.marker} ยกเลิกใบพักอนุมัติ`,
            }),
            409,
            `Lot '${lotId}' (lot_number '${lot.lot_number}') has changed since this adjustment was submitted (available_qty=10, expected ${10 + limit + 1}) — cannot cancel. Submit a new stock adjustment instead.`,
          )
          expect((await s.read('stock-adjustments', draft.id)).status).toBe('PENDING_APPROVAL')
          expect(await s.snapshot()).toEqual(before)
        } finally {
          await s.cleanup()
        }
      },
    )
  },
)

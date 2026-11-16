import { ReturnScenario } from '@api/return-scenario'
import { expect, test } from '@fixtures/test'
import { rejection, cogs } from './support'
async function settledCancelled(s: ReturnScenario) {
  if (s.fulfillment) await cogs(s, 0, 0, 4)
}
async function settled(s: ReturnScenario, returned: number) {
  if (s.fulfillment) await cogs(s, s.qty - returned, (s.qty - returned) * s.cost, returned ? 4 : 2)
}

test.describe(
  'Return quantity/state/dependency guards',
  { tag: ['@returns', '@api', '@regression', '@mutation'] },
  () => {
    for (const kind of ['purchase', 'sales'] as const) {
      test(`${kind}: over-return rejected at create and rechecked after another draft submits`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new ReturnScenario(api, kind)
        try {
          await s.seed()
          const before = await s.snapshot()
          const input = s.input(5)
          const item = s.source.items[0]!.id
          const messages = {
            purchase: `Cannot return 5 of goods receipt item '${item}': only 4 of the 4 received remain un-returned (0 already returned).`,
            sales: `Cannot return 5 of delivered line '${item}': only 4 of the 4 delivered remain un-returned (0 already returned).`,
          }
          await rejection(await api.postResponse(s.path, input), 409, messages[kind])
          expect(await s.snapshot()).toEqual(before)
          const first = await s.create(3)
          const second = await s.create(2)
          await s.action(first.id, 'submit')
          await settled(s, 3)
          const after = await s.snapshot()
          const stale = {
            purchase: `Cannot return 2 of goods receipt item '${item}': only 1 remain un-returned — another return was submitted against this receipt in the meantime.`,
            sales: `Cannot return 2 of delivered line '${item}': only 1 of the 4 delivered remain un-returned (3 already returned).`,
          }
          await rejection(await api.postResponse(`${s.path}/${second.id}/submit`, {}), 409, stale[kind])
          expect((await s.read(second.id)).status).toBe('DRAFT')
          expect(await s.snapshot()).toEqual(after)
        } finally {
          await s.cleanup()
        }
      })

      for (const state of ['DRAFT', 'CANCELLED'] as const) {
        test(`${kind}: ${state} source cannot accept returns`, async ({ allowMutation, api }) => {
          void allowMutation
          const s = new ReturnScenario(api, kind)
          try {
            const seed = {
              DRAFT: () => s.seed(false),
              CANCELLED: async () => {
                await s.seed()
                const paths = {
                  purchase: `/inventory-bc/v1/goods-receipts/${s.source.id}`,
                  sales: `/sales-bc/v1/delivery-notes/${s.source.id}`,
                }
                await api.post(`${paths[kind]}/cancel`, { cancel_reason: `${s.marker} ทดสอบเอกสารยกเลิก` })
                await settledCancelled(s)
              },
            }
            await seed[state]()
            const before = await s.snapshot()
            const details = {
              purchase: `Goods receipt '${s.source.id}' has status '${state}' — only a SUBMITTED goods receipt has stock that can be returned.`,
              sales: `Delivery note '${s.source.dn_number}' is ${state} — only a SUBMITTED delivery has shipped goods that can come back.`,
            }
            await rejection(await api.postResponse(s.path, s.input()), 400, details[kind], 'BAD_REQUEST')
            expect(await s.snapshot()).toEqual(before)
          } finally {
            await s.cleanup()
          }
        })
      }

      test(`${kind}: duplicate line and invalid DTO quantities do not affect source`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new ReturnScenario(api, kind)
        try {
          await s.seed()
          const before = await s.snapshot()
          const input = s.input()
          input.items.push(input.items[0] as never)
          const item = s.source.items[0]!.id
          const details = {
            purchase: `Goods receipt item '${item}' appears more than once — combine the quantities into a single line.`,
            sales: `Delivered line '${item}' appears more than once — combine the quantities into a single line.`,
          }
          await rejection(await api.postResponse(s.path, input), 400, details[kind], 'BAD_REQUEST')
          const invalid = s.input(0)
          invalid.return_reason = ''
          const response = await api.postResponse(s.path, invalid)
          expect(response.status()).toBe(400)
          expect(await response.json()).toMatchObject({
            status: { code: 400001 },
            errors: expect.arrayContaining([
              expect.objectContaining({
                code: 'VALIDATION_ERROR',
                source: { pointer: '/data/attributes/items.0.qty' },
              }),
            ]),
          })
          expect(await s.snapshot()).toEqual(before)
        } finally {
          await s.cleanup()
        }
      })
    }

    test('purchase: stock shortage in the original lot prevents submit without side effects', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new ReturnScenario(api, 'purchase')
      try {
        await s.seed()
        await s.issue(3)
        const draft = await s.create(2)
        const lot = (await s.lots())[0]!
        const before = await s.snapshot()
        await rejection(
          await api.postResponse(`${s.path}/${draft.id}/submit`, {}),
          409,
          `Lot '${lot.id}' (lot_number '${lot.lot_number}') has only 1 on hand — cannot return 2. Some of this lot has already been issued; reverse that movement first.`,
        )
        expect((await s.read(draft.id)).status).toBe('DRAFT')
        expect(await s.snapshot()).toEqual(before)
      } finally {
        await s.cleanup()
      }
    })

    test('sales: consumed returned goods block cancel, original return cost and state remain intact', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new ReturnScenario(api, 'sales')
      try {
        await s.seed()
        const draft = await s.create(2)
        await s.action(draft.id, 'submit')
        await cogs(s, 2, 80, 4)
        const issue = await s.issue(1)
        const lot = (await s.lots())[0]!
        const before = await s.snapshot()
        await rejection(
          await api.postResponse(`${s.path}/${draft.id}/cancel`, { cancel_reason: `${s.marker} คืนถูกเบิกแล้ว` }),
          409,
          `Lot '${lot.id}' (lot_number '${lot.lot_number}') has only 1 on hand — cannot take back 2 of a cancelled sales return. The returned goods have since been issued again; reverse that movement first.`,
          409000, // Plain stock-return RPC ConflictException retains the numeric error code.
        )
        expect((await s.read(draft.id)).status).toBe('SUBMITTED')
        expect(await s.snapshot()).toEqual(before)
        await api.post(`/inventory-bc/v1/stock-entries/${issue.id}/cancel`, { cancel_reason: `${s.marker} ย้อนเบิก` })
        await s.action(draft.id, 'cancel')
        await cogs(s, 4, 160, 6)
      } finally {
        await s.cleanup()
      }
    })

    for (const state of ['DRAFT', 'SUBMITTED'] as const) {
      const prepare = {
        DRAFT: async () => {},
        SUBMITTED: async (s: ReturnScenario, id: string) => {
          await s.action(id, 'submit')
          await cogs(s, 3, 120, 4)
        },
      }

      test(`sales: ${state} return dependency blocks DN cancellation`, async ({ allowMutation, api }) => {
        void allowMutation
        const s = new ReturnScenario(api, 'sales')
        try {
          await s.seed()
          const draft = await s.create(1)
          await prepare[state](s, draft.id)
          expect((await s.read(draft.id)).status).toBe(state)
          const before = await s.snapshot()
          await rejection(
            await api.postResponse(`/sales-bc/v1/delivery-notes/${s.source.id}/cancel`, {
              cancel_reason: `${s.marker} ยังมีใบรับคืน`,
            }),
            409,
            `Delivery note '${s.source.id}' still has 1 sales return(s) (${draft.srn_number}) — cancel them first; cancelling the delivery on top would put the returned goods back twice.`,
          )
          expect((await s.fulfillment!.note(s.source.id)).status).toBe('SUBMITTED')
          expect(await s.snapshot()).toEqual(before)
        } finally {
          await s.cleanup()
        }
      })
    }
  },
)

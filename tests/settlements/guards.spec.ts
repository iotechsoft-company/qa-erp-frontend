import { SettlementScenario } from '@api/settlement-scenario'
import { expect, test } from '@fixtures/test'
import { balances, money, rejected } from './support'

test.describe(
  'Settlement validation and stale draft guards (API path)',
  { tag: ['@finance', '@settlements', '@regression', '@mutation'] },
  () => {
    for (const kind of ['ar', 'ap'] as const) {
      const label = kind === 'ar' ? 'receipt' : 'AP invoice'
      const refundLabel = kind === 'ar' ? 'Customer refund' : 'Supplier refund'

      test(`${kind}: excessive allocation and withholding reject; submit rechecks debt without side effects`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new SettlementScenario(api, kind)
        try {
          await s.seed()
          const invoice = await s.newInvoice()
          const before = await s.snapshot()
          await rejected(
            await api.postResponse(s.path('payment-entries'), s.paymentInput(invoice.total + 1)),
            400,
            `Allocating ${money(invoice.total + 1)} to ${label} '${invoice.document_number}' exceeds its outstanding ${invoice.total}.`,
          )
          await rejected(
            await api.postResponse(s.path('payment-entries'), s.paymentInput(9, 10, invoice, { wht_amount: 1 })),
            400,
            `Withholding 1 against ${label} '${invoice.document_number}' exceeds the 0 still available (document expects 0, of which 0 is already withheld by other payments).`,
          )
          expect(await s.snapshot()).toEqual(before)
          const first = await s.create('payment-entries', s.paymentInput(invoice.total))
          const stale = await s.create('payment-entries', s.paymentInput(invoice.total))
          await s.action('payment-entries', first.id, 'submit')
          await balances(s, 0)
          const after = await s.snapshot()
          await rejected(
            await api.postResponse(`${s.path('payment-entries')}/${stale.id}/submit`, {}),
            400,
            `Allocating ${invoice.total} to ${label} '${invoice.document_number}' exceeds its outstanding 0.`,
          )
          expect(await s.snapshot()).toEqual(after)
          expect((await s.read('payment-entries', stale.id)).status).toBe('DRAFT')
          expect(await s.finance.ledger(stale.id)).toEqual([])
        } finally {
          await s.cleanup()
        }
      })

      test(`${kind}: credit source cannot be overdrawn; competing refund rechecks at submit; repeated transitions reject`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new SettlementScenario(api, kind)
        try {
          await s.seed()
          const invoice = await s.newInvoice()
          const pay = await s.create('payment-entries', s.paymentInput(30, 0))
          await s.action('payment-entries', pay.id, 'submit')
          await balances(s, invoice.total, 30)
          const before = await s.snapshot()
          await rejected(
            await api.postResponse(s.path(s.refundResource), s.refundInput(pay.id, 31)),
            409,
            `Drawing 31 from credit source '${pay.id}' exceeds the 30 it still has.`,
          )
          expect(await s.snapshot()).toEqual(before)
          const refund = await s.create(s.refundResource, s.refundInput(pay.id, 20))
          const stale = await s.create(s.refundResource, s.refundInput(pay.id, 20))
          const posted = await s.action(s.refundResource, refund.id, 'submit')
          await balances(s, invoice.total, 10)
          const after = await s.snapshot()
          await rejected(
            await api.postResponse(`${s.path(s.refundResource)}/${stale.id}/submit`, {}),
            409,
            `Drawing 20 from credit source '${pay.id}' exceeds the 10 it still has.`,
          )
          await rejected(
            await api.postResponse(`${s.path(s.refundResource)}/${refund.id}/submit`, {}),
            409,
            `${refundLabel} '${posted.document_number}' is SUBMITTED — only a DRAFT one can be submitted.`,
          )
          expect(await s.snapshot()).toEqual(after)
          const application = await s.create(s.creditResource, s.creditInput(pay.id, 10))
          const applied = await s.action(s.creditResource, application.id, 'submit')
          await balances(s, money(invoice.total - 10))
          const state = await s.snapshot()
          await rejected(
            await api.postResponse(`${s.path(s.creditResource)}/${application.id}/submit`, {}),
            409,
            `Credit application '${applied.document_number}' is SUBMITTED — only a DRAFT one can be submitted.`,
          )
          expect(await s.snapshot()).toEqual(state)
        } finally {
          await s.cleanup()
        }
      })
    }

    test('billing duplicate and draft invoices reject; repeated issue/cancel reject with no GL or debt changes', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new SettlementScenario(api)
      try {
        await s.seed()
        const draft = await s.finance.create()
        const before = await s.snapshot()
        await rejected(
          await api.postResponse(s.path('billing-notes'), s.billingInput([draft.id])),
          400,
          `Receipt '${draft.document_number ?? draft.id}' is DRAFT — only an ISSUED document can be billed.`,
        )
        expect(await s.snapshot()).toEqual(before)
        const invoice = await s.newInvoice()
        await rejected(
          await api.postResponse(s.path('billing-notes'), s.billingInput([invoice.id, invoice.id])),
          400,
          'The same invoice appears more than once — list each invoice only once.',
        )
        const bill = await s.create('billing-notes', s.billingInput())
        await s.action('billing-notes', bill.id, 'issue')
        const issued = await s.snapshot()
        await rejected(
          await api.postResponse(`${s.path('billing-notes')}/${bill.id}/issue`, {}),
          409,
          `Billing note '${bill.id}' is ISSUED — only a DRAFT can be issued.`,
        )
        expect(await s.snapshot()).toEqual(issued)
        await s.action('billing-notes', bill.id, 'cancel')
        const cancelled = await s.snapshot()
        await rejected(
          await api.postResponse(`${s.path('billing-notes')}/${bill.id}/cancel`, {
            cancel_reason: `${s.marker} ยกเลิกซ้ำ`,
          }),
          409,
          `Billing note '${bill.id}' is CANCELLED — only an ISSUED note can be cancelled.`,
        )
        expect(await s.snapshot()).toEqual(cancelled)
      } finally {
        await s.cleanup()
      }
    })
  },
)

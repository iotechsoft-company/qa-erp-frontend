import { SettlementScenario } from '@api/settlement-scenario'
import { test, expect } from '@fixtures/test'
import { balances, journal, money, rejected } from './support'

test.describe(
  'C4 owned payments (API path; no settlement UI)',
  { tag: ['@finance', '@settlements', '@regression', '@mutation'] },
  () => {
    for (const kind of ['ar', 'ap'] as const) {
      const roles = (amount: number): Record<string, number> =>
        kind === 'ar' ? { CASH: amount, ACCOUNTS_RECEIVABLE: -amount } : { CASH: -amount, ACCOUNTS_PAYABLE: amount }

      test(`${kind}: partial → full payment; ledger and remaining debt reverse once`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new SettlementScenario(api, kind)
        try {
          await s.seed()
          const invoice = await s.newInvoice()
          const stock = await s.finance.source.snapshot()
          const first = await s.create('payment-entries', s.paymentInput(20))
          expect(await s.finance.ledger(first.id)).toEqual([])
          await balances(s, invoice.total)
          const posted = await s.action('payment-entries', first.id, 'submit')
          expect(posted).toMatchObject({
            status: 'SUBMITTED',
            paid_amount: 20,
            allocated_amount: 20,
            unallocated_amount: 0,
          })
          await balances(s, money(invoice.total - 20))
          await journal(s, first.id, roles(20))
          const remaining = money(invoice.total - 20),
            second = await s.create('payment-entries', s.paymentInput(remaining))
          await s.action('payment-entries', second.id, 'submit')
          await balances(s, 0)
          await journal(s, second.id, roles(remaining))
          const state = await s.snapshot()
          await rejected(
            await api.postResponse(`${s.path('payment-entries')}/${second.id}/submit`, {}),
            409,
            `Payment entry '${second.id}' is SUBMITTED — only a DRAFT can be submitted.`,
          )
          expect(await s.snapshot()).toEqual(state)
          await s.action('payment-entries', second.id, 'cancel')
          await balances(s, remaining)
          await journal(s, second.id, roles(remaining), true)
          await s.action('payment-entries', first.id, 'cancel')
          await balances(s, invoice.total)
          await journal(s, first.id, roles(20), true)
          expect(await s.finance.source.snapshot()).toEqual(stock)
        } finally {
          await s.cleanup()
        }
      })
    }
  },
)

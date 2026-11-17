import { SettlementScenario } from '@api/settlement-scenario'
import { test, expect } from '@fixtures/test'
import { balances, journal, money, rejected } from './support'

function paymentRoles(kind: 'ar' | 'ap', paid: number): Record<string, number> {
  return kind === 'ar' ? { CASH: paid, ACCOUNTS_RECEIVABLE: -paid } : { CASH: -paid, ACCOUNTS_PAYABLE: paid }
}

test.describe(
  'C10 customer/supplier credit and refunds (API path)',
  { tag: ['@finance', '@settlements', '@regression', '@mutation'] },
  () => {
    for (const kind of ['ar', 'ap'] as const) {
      const refundRoles: Record<string, number> =
        kind === 'ar' ? { CASH: -20, ACCOUNTS_RECEIVABLE: 20 } : { CASH: 20, ACCOUNTS_PAYABLE: -20 }

      test(`${kind}: overpayment → apply credit → refund remainder; source guards, balances and GL reverse`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new SettlementScenario(api, kind)
        try {
          await s.seed()
          const invoice = await s.newInvoice()
          const target = await s.newInvoice()
          const paid = money(invoice.total + 100)
          const payRoles = paymentRoles(kind, paid)
          const stock = await s.finance.source.snapshot()
          const payment = await s.create('payment-entries', s.paymentInput(paid, invoice.total))
          const advance = await s.action('payment-entries', payment.id, 'submit')
          expect(advance).toMatchObject({ allocated_amount: invoice.total, unallocated_amount: 100 })
          await balances(s, invoice.total, 100)
          await journal(s, payment.id, payRoles)
          const apply = await s.create(s.creditResource, s.creditInput(payment.id, 30, target.id))
          await balances(s, invoice.total, 100)
          const applied = await s.action(s.creditResource, apply.id, 'submit')
          expect(applied.total).toBe(30)
          await balances(s, money(invoice.total - 30), 70)
          await journal(s, apply.id, {})
          const refund = await s.create(s.refundResource, s.refundInput(payment.id, 20))
          const refunded = await s.action(s.refundResource, refund.id, 'submit')
          expect(refunded.total).toBe(20)
          await balances(s, money(invoice.total - 30), 50)
          await journal(s, refund.id, refundRoles)
          const before = await s.snapshot()
          await rejected(
            await api.postResponse(`${s.path('payment-entries')}/${payment.id}/cancel`, {
              cancel_reason: `${s.marker} ตรวจเครดิตที่ใช้`,
            }),
            409,
            `Payment entry '${advance.payment_number}' is the credit behind ${[applied.document_number, refunded.document_number].sort().join(', ')} — cancel those first.`,
          )
          expect(await s.snapshot()).toEqual(before)
          await s.action(s.refundResource, refund.id, 'cancel')
          await balances(s, money(invoice.total - 30), 70)
          await journal(s, refund.id, refundRoles, true)
          await s.action(s.creditResource, apply.id, 'cancel')
          await balances(s, invoice.total, 100)
          await journal(s, apply.id, {})
          await s.action('payment-entries', payment.id, 'cancel')
          await balances(s, money(invoice.total + target.total))
          await journal(s, payment.id, payRoles, true)
          expect(await s.finance.source.snapshot()).toEqual(stock)
        } finally {
          await s.cleanup()
        }
      })
    }
  },
)

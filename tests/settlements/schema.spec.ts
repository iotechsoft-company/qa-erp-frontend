import { SettlementScenario } from '@api/settlement-scenario'
import { expect, test } from '@fixtures/test'
import { rejected } from './support'

test.describe(
  'Settlement DTO validation (API path)',
  { tag: ['@finance', '@settlements', '@regression', '@mutation'] },
  () => {
    for (const kind of ['ar', 'ap'] as const) {
      const sourceField = kind === 'ar' ? 'source_receipt_id' : 'source_ap_invoice_id'

      test(`${kind}: invalid amounts/empty lines/source XOR reject without creating records`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new SettlementScenario(api, kind)
        try {
          await s.seed()
          await s.newInvoice()
          const payment = await s.create('payment-entries', s.paymentInput(50, 0))
          await s.action('payment-entries', payment.id, 'submit')
          const before = await s.snapshot()
          const cases = [
            { resource: 'payment-entries' as const, input: s.paymentInput(-1, 0), pointer: 'paid_amount' },
            {
              resource: s.creditResource,
              input: s.creditInput(payment.id, 10, s.invoice.id, { lines: [] }),
              pointer: 'lines',
            },
            { resource: s.refundResource, input: s.refundInput(payment.id, 10, { lines: [] }), pointer: 'lines' },
          ]
          for (const c of cases) {
            const response = await api.postResponse(s.path(c.resource), c.input)
            expect(response.status()).toBe(400)
            expect(await response.json()).toMatchObject({
              status: { code: 400001, message: 'Validation Failed' },
              errors: [{ code: 'VALIDATION_ERROR', source: { pointer: `/data/attributes/${c.pointer}` } }],
            })
          }
          const invalid = s.refundInput(payment.id, 10, {
            lines: [{ source_payment_entry_id: payment.id, [sourceField]: s.invoice.id, amount: 10 }],
          })
          await rejected(
            await api.postResponse(s.path(s.refundResource), invalid),
            400,
            `Line 1 must name exactly one credit source — ${sourceField} (a credit note) or source_payment_entry_id (a payment).`,
          )
          expect(await s.snapshot()).toEqual(before)
        } finally {
          await s.cleanup()
        }
      })
    }
  },
)

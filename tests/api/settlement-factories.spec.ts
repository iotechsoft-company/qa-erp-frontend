import { SettlementScenario } from '@api/settlement-scenario'
import { expect, test } from '@fixtures/test'
import { type SettlementResource } from '@data/settlement-cleanup'

test.describe(
  'Settlement factories ↔ DTO (API path)',
  { tag: ['@finance', '@api', '@regression', '@mutation'] },
  () => {
    for (const kind of ['ar', 'ap'] as const) {
      test(`${kind}: owned draft create/read/delete for payments, credit and refund; payment PATCH`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new SettlementScenario(api, kind)
        try {
          await s.seed()
          const invoice = await s.newInvoice()
          const payment = await s.create('payment-entries', s.paymentInput(100, 0))
          const remark = `${s.marker} แก้ไขการชำระ`
          await api.patch(`${s.path('payment-entries')}/${payment.id}`, { remark_th: remark })
          expect((await s.read('payment-entries', payment.id)).remark?.th).toBe(remark)
          expect(await s.finance.ledger(payment.id)).toEqual([])
          await s.action('payment-entries', payment.id, 'submit')
          for (const resource of [s.creditResource, s.refundResource]) {
            const doc = await s.create(
              resource,
              resource === s.creditResource ? s.creditInput(payment.id) : s.refundInput(payment.id),
            )
            expect(doc.status).toBe('DRAFT')
            expect(doc.remark?.th).toContain(s.marker)
            expect(doc.lines[0]).toMatchObject({ source_payment_entry_id: payment.id, amount: 10 })
            expect(await s.finance.ledger(doc.id)).toEqual([])
            await api.delete(`${s.path(resource)}/${doc.id}`)
            expect(await api.list(s.path(resource), { filter: `id||$eq||${doc.id}` })).toEqual([])
          }
          const draft = await s.create('payment-entries', s.paymentInput(10))
          expect(draft.allocations[0]).toMatchObject({
            [kind === 'ar' ? 'receipt_id' : 'ap_invoice_id']: invoice.id,
            allocated_amount: 10,
          })
          await api.delete(`${s.path('payment-entries')}/${draft.id}`)
          expect(await api.list(s.path('payment-entries'), { filter: `id||$eq||${draft.id}` })).toEqual([])
        } finally {
          await s.cleanup()
        }
      })
    }

    test('billing: draft create/read/PATCH/delete', async ({ allowMutation, api }) => {
      void allowMutation
      const s = new SettlementScenario(api)
      try {
        await s.seed()
        const invoice = await s.newInvoice()
        const resource: SettlementResource = 'billing-notes'
        const bill = await s.create(resource, s.billingInput())
        expect(bill.invoices[0]).toMatchObject({ receipt_id: invoice.id, amount: invoice.total })
        const changed = `${s.marker} แก้ไขวางบิล`
        await api.patch(`${s.path(resource)}/${bill.id}`, { remark_th: changed })
        expect((await s.read(resource, bill.id)).remark?.th).toBe(changed)
        await api.delete(`${s.path(resource)}/${bill.id}`)
        expect(await api.list(s.path(resource), { filter: `id||$eq||${bill.id}` })).toEqual([])
      } finally {
        await s.cleanup()
      }
    })
  },
)

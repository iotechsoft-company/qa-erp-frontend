import { type ApiClient } from '@api/api-client'
import { SettlementScenario } from '@api/settlement-scenario'
import { buildCustomer, buildSupplier } from '@data/factories'
import { expect, test } from '@fixtures/test'
import { money, rejected } from './support'

async function removeOwnedParty(api: ApiClient, resource: string, id: string) {
  if (id) await api.delete(`${resource}/${id}`)
}

test.describe(
  'Settlement party and outstanding guards (owned masters)',
  { tag: ['@finance', '@settlements', '@regression', '@mutation'] },
  () => {
    for (const kind of ['ar', 'ap'] as const) {
      const resource = kind === 'ar' ? '/sales-bc/v1/customers' : '/supplier-bc/v1/suppliers'
      const input = () => (kind === 'ar' ? buildCustomer() : buildSupplier())
      const invoiceLabel = kind === 'ar' ? 'receipt' : 'AP invoice'
      const paymentLabel = kind === 'ar' ? 'Receipt' : 'AP invoice'
      const partyLabel = kind === 'ar' ? 'customer' : 'supplier'
      const creditSuffix = kind === 'ar' ? "customer's invoices" : "supplier's bills"

      test(`${kind}: wrong party and credit above target outstanding reject without side effects`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new SettlementScenario(api, kind)
        let otherId = ''
        try {
          await s.seed()
          const invoice = await s.newInvoice()
          otherId = (await api.create(resource, input())).id
          const pay = await s.create('payment-entries', s.paymentInput(500, 0))
          await s.action('payment-entries', pay.id, 'submit')
          const before = await s.snapshot()
          await rejected(
            await api.postResponse(s.path('payment-entries'), s.paymentInput(10, 10, invoice, { party_id: otherId })),
            400,
            `${paymentLabel} '${invoice.document_number}' belongs to a different ${partyLabel} — a payment can only settle its own party's invoices.`,
          )
          const credit = s.creditInput(pay.id, 10)
          credit[`${partyLabel}_id`] = otherId
          await rejected(
            await api.postResponse(s.path(s.creditResource), credit),
            400,
            `${paymentLabel} '${invoice.document_number}' belongs to a different ${partyLabel} — credit can only settle its own ${creditSuffix}.`,
          )
          const excess = money(invoice.total + 1)
          await rejected(
            await api.postResponse(s.path(s.creditResource), s.creditInput(pay.id, excess)),
            409,
            `Applying ${excess} to ${invoiceLabel} '${invoice.document_number}' exceeds its outstanding ${invoice.total}.`,
          )
          expect(await s.snapshot()).toEqual(before)
        } finally {
          try {
            await s.cleanup()
          } finally {
            await removeOwnedParty(api, resource, otherId)
          }
        }
      })
    }

    test('billing rejects another owned customer, a settled invoice and a voided invoice', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new SettlementScenario(api)
      let customerId = ''
      try {
        await s.seed()
        const invoice = await s.newInvoice()
        customerId = (await api.create('/sales-bc/v1/customers', buildCustomer())).id
        const before = await s.snapshot()
        await rejected(
          await api.postResponse(s.path('billing-notes'), s.billingInput([invoice.id], { customer_id: customerId })),
          400,
          `Receipt '${invoice.document_number}' belongs to a different customer — a billing note covers one customer.`,
        )
        expect(await s.snapshot()).toEqual(before)
        const payment = await s.create('payment-entries', s.paymentInput(invoice.total))
        await s.action('payment-entries', payment.id, 'submit')
        const settled = await s.snapshot()
        await rejected(
          await api.postResponse(s.path('billing-notes'), s.billingInput()),
          400,
          `Receipt '${invoice.document_number}' is already settled — there is nothing left to bill.`,
        )
        expect(await s.snapshot()).toEqual(settled)
        await s.action('payment-entries', payment.id, 'cancel')
        await s.finance.action(invoice.id, 'void')
        const voided = await s.snapshot()
        await rejected(
          await api.postResponse(s.path('billing-notes'), s.billingInput()),
          400,
          `Receipt '${invoice.document_number}' is VOID — only an ISSUED document can be billed.`,
        )
        expect(await s.snapshot()).toEqual(voided)
      } finally {
        try {
          await s.cleanup()
        } finally {
          await removeOwnedParty(api, '/sales-bc/v1/customers', customerId)
        }
      }
    })
  },
)

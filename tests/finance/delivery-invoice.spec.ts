import { FinanceScenario } from '@api/finance-scenario'
import { expect, test } from '@fixtures/test'
import { debt, money, posting, rejected } from './support'

async function rejectDuplicate(s: FinanceScenario) {
  const automatic = s.deliveryInvoice!
  const snapshot = async () => ({
    source: await s.source.snapshot(),
    invoice: await s.read(automatic.id),
    ledger: await s.ledger(automatic.id),
  })
  const before = await snapshot()
  const response = await s.api.postResponse(s.path, s.linkedReceiptInput())
  await rejected(
    response,
    409,
    `Delivery note '${s.source.source.dn_number}' already issued tax invoice '${automatic.document_number}' when it was submitted — it cannot be invoiced again.`,
  )
  expect(await response.json()).toMatchObject({
    errors: [
      {
        code: 'DELIVERY_NOTE_ALREADY_INVOICED',
        meta: { delivery_note_id: s.source.source.id, receipt_number: automatic.document_number },
      },
    ],
  })
  expect(await snapshot()).toEqual(before)
}

test.describe(
  'BE-14 automatic delivery invoicing (owned API path)',
  {
    tag: ['@sales', '@finance', '@api', '@regression', '@mutation'],
  },
  () => {
    test('DN submission issues one linked tax invoice; DN cancellation voids it and reverses stock/COGS/GL/AR', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new FinanceScenario(api, 'ar')
      try {
        await s.seed(true, { keepDeliveryInvoice: true })
        const invoice = s.deliveryInvoice!
        expect(invoice).toMatchObject({
          document_type: 'FULL_TAX_INVOICE',
          status: 'ISSUED',
          is_issued_on_delivery: true,
          delivery_note_id: s.source.source.id,
          customer_id: s.partyId,
          net_amount: 600,
          vat_rate: s.vatRate,
          vat_amount: money((600 * s.vatRate) / 100),
          total: money(600 * (1 + s.vatRate / 100)),
          items: [
            expect.objectContaining({
              dn_item_id: s.source.source.items[0]!.id,
              product_id: s.productId,
              qty: 4,
              unit_price: 150,
            }),
          ],
        })
        expect(invoice.document_number).toEqual(expect.any(String))
        await posting(s, invoice)
        await debt(s, invoice.total)
        expect(await s.source.inventory.stockQty()).toBe(0)
        await api.post(`/sales-bc/v1/delivery-notes/${s.source.source.id}/cancel`, {
          cancel_reason: `${s.marker} ย้อนส่งของและภาษีอัตโนมัติ`,
        })
        await expect(async () => {
          expect((await s.source.fulfillment!.note(s.source.source.id)).status).toBe('CANCELLED')
          expect(await s.read(invoice.id)).toMatchObject({ status: 'VOID', document_number: invoice.document_number })
        }).toPass({ timeout: 10_000 })
        await posting(s, invoice, true)
        await debt(s, 0)
        await expect.poll(() => s.source.inventory.stockQty()).toBe(4)
        await expect.poll(async () => (await s.source.fulfillment!.costs()).length).toBe(0)
      } finally {
        await s.cleanup()
      }
    })

    test('manual DN-linked invoicing rejects with the exact existing invoice both before and after its void', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new FinanceScenario(api, 'ar')
      try {
        await s.seed(true, { keepDeliveryInvoice: true })
        expect(s.deliveryInvoice).toMatchObject({ status: 'ISSUED', is_issued_on_delivery: true })
        await rejectDuplicate(s)
        const invoice = s.deliveryInvoice!
        await s.action(invoice.id, 'void')
        await posting(s, invoice, true)
        await debt(s, 0)
        await rejectDuplicate(s)
      } finally {
        await s.cleanup()
      }
    })
  },
)

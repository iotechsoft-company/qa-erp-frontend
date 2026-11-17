import { SettlementScenario } from '@api/settlement-scenario'
import { expect, test } from '@fixtures/test'
import { balances, journal, money, rejected } from './support'

function cnInput(s: SettlementScenario, originalId: string) {
  return s.kind === 'ar'
    ? s.finance.receiptInput({
        document_type: 'CREDIT_NOTE',
        reference_receipt_id: originalId,
        adjustment_reason: `${s.marker} ลดราคา`,
        delivery_note_id: undefined,
        items: [{ product_id: s.finance.productId, qty: 1, unit_price: 30 }],
      })
    : s.finance.apInput({
        document_type: 'CREDIT_NOTE',
        reference_ap_invoice_id: originalId,
        items: [{ grn_item_id: s.finance.source.source.items[0]!.id, qty: 1, unit_cost: 40 }],
      })
}
async function supplierReturn(s: SettlementScenario) {
  if (s.kind === 'ap') {
    const returned = await s.finance.source.create(1)
    await s.finance.source.action(returned.id, 'submit')
  }
}
function cnSource(s: SettlementScenario, id: string) {
  return s.kind === 'ar' ? { source_receipt_id: id } : { source_ap_invoice_id: id }
}
function creditTarget(s: SettlementScenario, id: string) {
  return s.kind === 'ar' ? { target_receipt_id: id } : { target_ap_invoice_id: id }
}
function refundRoles(s: SettlementScenario): Record<string, number> {
  return s.kind === 'ar' ? { CASH: -10, ACCOUNTS_RECEIVABLE: 10 } : { CASH: 10, ACCOUNTS_PAYABLE: -10 }
}

// Both utilities treat CNs as a shared surplus of their original invoice, not a second debt.
test.describe(
  'C10 credit-note surplus sources (API path)',
  { tag: ['@finance', '@settlements', '@regression', '@mutation'] },
  () => {
    for (const kind of ['ar', 'ap'] as const) {
      test(`${kind}: fully paid invoice → CN surplus → application/refund; reversing consumers restores pool`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new SettlementScenario(api, kind)
        try {
          await s.seed()
          const original = await s.newInvoice()
          const target = await s.newInvoice()
          const payment = await s.create('payment-entries', s.paymentInput(original.total))
          const paid = await s.action('payment-entries', payment.id, 'submit')
          await supplierReturn(s)
          const input = cnInput(s, original.id)
          const cn = await s.finance.create(input)
          const posted = await s.finance.action(cn.id, kind === 'ar' ? 'issue' : 'submit')
          await balances(s, target.total, posted.total)
          const source = cnSource(s, cn.id)
          const targetRef = creditTarget(s, target.id)
          const application = await s.create(
            s.creditResource,
            s.creditInput(payment.id, 10, target.id, { lines: [{ ...source, ...targetRef, amount: 10 }] }),
          )
          await s.action(s.creditResource, application.id, 'submit')
          const refund = await s.create(
            s.refundResource,
            s.refundInput(payment.id, 10, { lines: [{ ...source, amount: 10 }] }),
          )
          await s.action(s.refundResource, refund.id, 'submit')
          await balances(s, money(target.total - 10), money(posted.total - 20))
          await journal(s, application.id, {})
          const roles = refundRoles(s)
          await journal(s, refund.id, roles)
          // Reversing the paid source would erase the surplus under live credit consumers.
          const before = await s.snapshot()
          const response = await api.postResponse(`${s.path('payment-entries')}/${payment.id}/cancel`, {
            cancel_reason: `${s.marker} ตรวจ surplus guard`,
          })
          await rejected(
            response,
            409,
            `Cannot cancel payment entry '${paid.payment_number}': 20 of the credit from credit notes on '${original.document_number}' has already been applied or refunded, and only 0 would remain to cover it. Cancel those credit applications or refunds first.`,
          )
          expect(await s.snapshot()).toEqual(before)
          await s.action(s.refundResource, refund.id, 'cancel')
          await s.action(s.creditResource, application.id, 'cancel')
          await balances(s, target.total, posted.total)
          await journal(s, refund.id, roles, true)
        } finally {
          await s.cleanup()
        }
      })
    }
  },
)

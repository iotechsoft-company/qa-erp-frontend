import { SettlementScenario } from '@api/settlement-scenario'
import { test, expect } from '@fixtures/test'
import { balances, journal, money, rejected } from './support'

test.describe('C3 billing notes (API path)', { tag: ['@finance', '@settlements', '@regression', '@mutation'] }, () => {
  test('draft aggregates own invoices; issue re-reads outstanding after payment, cancellation releases parent', async ({
    allowMutation,
    api,
  }) => {
    void allowMutation
    const s = new SettlementScenario(api, 'ar')
    try {
      await s.seed()
      const first = await s.newInvoice(),
        second = await s.newInvoice()
      const total = money(first.total + second.total)
      const note = await s.create('billing-notes', s.billingInput([first.id, second.id]))
      expect(note).toMatchObject({ status: 'DRAFT', document_number: null, total })
      expect(note.invoices.map((r) => r.receipt_id).sort()).toEqual([first.id, second.id].sort())
      await journal(s, note.id, {})
      await balances(s, total)
      const pay = await s.create('payment-entries', s.paymentInput(20))
      await s.action('payment-entries', pay.id, 'submit')
      const issued = await s.action('billing-notes', note.id, 'issue')
      expect(issued).toMatchObject({ status: 'ISSUED', total: money(total - 20) })
      expect(issued.document_number).toEqual(expect.any(String))
      await journal(s, note.id, {})
      await balances(s, money(total - 20))
      await s.action('payment-entries', pay.id, 'cancel')
      const before = await s.finance.ledger(first.id)
      await rejected(
        await api.postResponse(`${s.finance.path}/${first.id}/void`, { void_reason: `${s.marker} ตรวจวางบิล` }),
        409,
        `Receipt '${first.document_number}' is still collected by billing note(s) ${issued.document_number} — cancel them before voiding.`,
      )
      expect(await s.finance.ledger(first.id)).toEqual(before)
      await s.action('billing-notes', note.id, 'cancel')
      expect((await s.read('billing-notes', note.id)).document_number).toBe(issued.document_number)
      await s.finance.action(first.id, 'void')
      await balances(s, second.total)
      await journal(s, note.id, {})
    } finally {
      await s.cleanup()
    }
  })
})

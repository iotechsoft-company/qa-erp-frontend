import { SettlementScenario } from '@api/settlement-scenario'
import { buildSchedules } from '@data/factories'
import { expect, test } from '@fixtures/test'
import { balances, money, rejected } from './support'

test.describe(
  'C5 receipt instalments (API path)',
  { tag: ['@finance', '@settlements', '@regression', '@mutation'] },
  () => {
    test('replace preserves client sequence; payments settle head, credit notes reduce tail; void and invalid sums reject', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new SettlementScenario(api)
      try {
        await s.seed()
        const invoice = await s.scheduleInvoice()
        const tail = money(invoice.total - 70)
        const dates = [
          new Date(Date.now() - 86400000).toISOString(),
          new Date(Date.now() + 86400000 * 5).toISOString(),
          new Date(Date.now() + 86400000 * 2).toISOString(),
        ]
        await s.replaceSchedules([30, 40, tail], invoice.id, {
          instalments: dates.map((due_date, i) => ({ due_date, amount: [30, 40, tail][i]! })),
        })
        let rows = await s.readSchedules()
        expect(
          rows.map((r) => ({
            sequence: r.sequence,
            amount: r.amount,
            settled: r.settled,
            credited: r.credited,
            outstanding: r.outstanding,
            is_overdue: r.is_overdue,
          })),
        ).toEqual([
          { sequence: 1, amount: 30, settled: 0, credited: 0, outstanding: 30, is_overdue: true },
          { sequence: 2, amount: 40, settled: 0, credited: 0, outstanding: 40, is_overdue: false },
          { sequence: 3, amount: tail, settled: 0, credited: 0, outstanding: tail, is_overdue: false },
        ])
        expect(rows.map((r) => new Date(r.due_date).toISOString())).toEqual(dates)
        const before = rows
        const invalid = await api.putResponse(
          `/finance-bc/v1/receipts/${invoice.id}/payment-schedules`,
          buildSchedules([1]),
        )
        await rejected(
          invalid,
          400,
          `Instalments total 1 but the invoice is ${invoice.total} — a schedule has to restate the whole amount, not part of it.`,
        )
        expect(await s.readSchedules()).toEqual(before)
        const pay = await s.create('payment-entries', s.paymentInput(50))
        await s.action('payment-entries', pay.id, 'submit')
        const cn = await s.finance.create(
          s.finance.receiptInput({
            document_type: 'CREDIT_NOTE',
            reference_receipt_id: invoice.id,
            adjustment_reason: 'E2E-ลดหนี้',
            items: [
              {
                product_id: s.finance.productId,
                dn_item_id: s.finance.source.source.items[0]!.id,
                qty: 1,
                unit_price: 15,
              },
            ],
          }),
        )
        const issued = await s.finance.action(cn.id, 'issue')
        rows = await s.readSchedules()
        expect(rows.map((r) => r.settled)).toEqual([30, 20, 0])
        expect(rows.map((r) => r.credited)).toEqual([0, 0, issued.total])
        expect(money(rows.reduce((n, r) => n + r.outstanding, 0))).toBe(money(invoice.total - 50 - issued.total))
        await balances(s, money(invoice.total - 50 - issued.total))
        const aging = await s.aging()
        // Aging is header due-date based; instalment dates do not repartition its buckets.
        expect(aging[0]!.days_1_30).toBe(0)
        expect(aging[0]!.current).toBe(money(invoice.total - 50 - issued.total))
        await s.finance.action(cn.id, 'void')
        await s.action('payment-entries', pay.id, 'cancel')
        await s.replaceSchedules([invoice.total])
        expect((await s.readSchedules()).map((r) => r.amount)).toEqual([invoice.total])
        await s.finance.action(invoice.id, 'void')
        await rejected(
          await api.putResponse(
            `/finance-bc/v1/receipts/${invoice.id}/payment-schedules`,
            buildSchedules([invoice.total]),
          ),
          400,
          `Receipt '${invoice.document_number}' is VOID — a voided document has no terms to schedule.`,
        )
        expect((await s.readSchedules()).map((r) => r.amount)).toEqual([invoice.total])
        await api.delete(`/finance-bc/v1/receipts/${invoice.id}/payment-schedules`)
        expect(await s.readSchedules()).toEqual([])
      } finally {
        await s.cleanup()
      }
    })
  },
)

import { SettlementScenario } from '@api/settlement-scenario'
import { buildSchedules } from '@data/factories'
import { expect, test } from '@fixtures/test'

test(
  'C5 buildSchedules ↔ ReplacePaymentScheduleDTO: draft receipt replace/read/delete without posting',
  { tag: ['@finance', '@api', '@regression', '@mutation'] },
  async ({ allowMutation, api }) => {
    void allowMutation
    const s = new SettlementScenario(api)
    try {
      await s.seed()
      const invoice = await s.finance.create(
        s.finance.receiptInput({ remark_th: `${s.marker} [E2E-SCHEDULE] สัญญางวดชำระ` }),
      )
      expect(invoice.status).toBe('DRAFT')
      expect(invoice.customer_id).toBe(s.partyId)
      const stock = await s.finance.source.snapshot()
      const input = buildSchedules([invoice.total])
      await s.replaceSchedules([invoice.total], invoice.id, input)
      const rows = await s.readSchedules(invoice.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        receipt_id: invoice.id,
        sequence: 1,
        amount: invoice.total,
        credited: 0,
        settled: 0,
        outstanding: invoice.total,
        is_overdue: false,
      })
      expect(new Date(rows[0]!.due_date).toISOString()).toBe(input.instalments[0]!.due_date)
      const invalid = [
        { input: buildSchedules([]), field: 'instalments' },
        { input: buildSchedules([0]), field: 'instalments.0.amount' },
        {
          input: buildSchedules([invoice.total], {
            instalments: [{ due_date: 'invalid-date', amount: invoice.total }],
          }),
          field: 'instalments.0.due_date',
        },
      ]
      for (const entry of invalid) {
        const response = await api.putResponse(`/finance-bc/v1/receipts/${invoice.id}/payment-schedules`, entry.input)
        expect(response.status()).toBe(400)
        expect(await response.json()).toMatchObject({
          status: { code: 400001, message: 'Validation Failed' },
          errors: expect.arrayContaining([
            expect.objectContaining({
              code: 'VALIDATION_ERROR',
              source: { pointer: `/data/attributes/${entry.field}` },
            }),
          ]),
        })
        expect(await s.readSchedules(invoice.id)).toEqual(rows)
      }
      expect(await s.finance.ledger(invoice.id)).toEqual([])
      expect(await s.finance.source.snapshot()).toEqual(stock)
      await api.delete(`/finance-bc/v1/receipts/${invoice.id}/payment-schedules`)
      expect(await s.readSchedules(invoice.id)).toEqual([])
    } finally {
      await s.cleanup()
    }
  },
)

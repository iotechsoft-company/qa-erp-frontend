import { FinanceScenario } from '@api/finance-scenario'
import { expect, test } from '@fixtures/test'
import { money, posting } from './support'

test.describe('Finance totals and tax snapshots (API path)', { tag: ['@finance', '@regression', '@mutation'] }, () => {
  for (const kind of ['ap', 'ar'] as const) {
    const post = kind === 'ap' ? 'submit' : 'issue',
      reverse = kind === 'ap' ? 'cancel' : 'void'

    test(`${kind}: independent quantity/rounding/VAT calculations across all four discount modes`, async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new FinanceScenario(api, kind)
      try {
        await s.seed()
        const cases = [
          { mode: 'none', discount: 0, header: 0 },
          { mode: 'header', discount: 0, header: 2.23 },
          { mode: 'per_item', discount: 1.11, header: 0 },
          { mode: 'both', discount: 1.11, header: 2.23 },
        ] as const
        const source = await s.source.snapshot()
        for (const row of cases) {
          const common = { discount_mode: row.mode, discount_type: 'amount' as const, discount_value: row.header }
          const unit = 40.13,
            qty = 3
          const input = {
            ap: () =>
              s.apInput({
                ...common,
                items: [
                  {
                    grn_item_id: s.source.source.items[0]!.id,
                    qty,
                    unit_cost: unit,
                    discount_type: 'amount',
                    discount: row.discount,
                  },
                ],
              }),
            ar: () =>
              s.receiptInput({
                ...common,
                items: [
                  {
                    product_id: s.productId,
                    qty,
                    unit_price: unit,
                    discount_type: 'amount',
                    discount: row.discount,
                  },
                ],
              }),
          }[kind]()
          const doc = await s.create(input)
          const sub = money(qty * unit),
            discount = money(row.discount + row.header),
            net = money(sub - discount),
            vat = money((net * s.vatRate) / 100)
          expect(doc).toMatchObject({
            sub_total: sub,
            total_discount: discount,
            net_amount: net,
            vat_amount: vat,
            total: money(net + vat),
            total_wht: 0,
            is_vat_included: false,
            items: [expect.objectContaining({ qty, line_total: net, vat_amount: vat })],
          })
          const posted = await s.action(doc.id, post)
          await posting(s, posted)
          await s.action(doc.id, reverse)
          await posting(s, posted, true)
        }
        expect(await s.source.snapshot()).toEqual(source)
      } finally {
        await s.cleanup()
      }
    })
  }
  for (const type of ['RECEIPT', 'INVOICE', 'PROFORMA_INVOICE', 'INV_TAX_INVOICE', 'ABB_TAX_INVOICE'] as const) {
    const noTax = ['RECEIPT', 'INVOICE', 'PROFORMA_INVOICE'].includes(type)
    const included = type === 'ABB_TAX_INVOICE'
    const amounts = (vatRate: number) => {
      const rate = noTax ? 0 : vatRate
      const net = included ? money(150 / (1 + rate / 100)) : 150
      return { rate, net, vat: included ? money(150 - net) : money((net * rate) / 100) }
    }

    test(`C1 ${type}: document type controls VAT/GL and number survives void`, async ({ allowMutation, api }) => {
      void allowMutation
      const s = new FinanceScenario(api, 'ar')
      try {
        await s.seed()
        const doc = await s.create(s.receiptInput({ document_type: type }))
        const { rate, net, vat } = amounts(s.vatRate)
        expect(doc).toMatchObject({
          is_vat_included: included,
          vat_rate: rate,
          net_amount: net,
          vat_amount: vat,
          total: money(net + vat),
        })
        const issued = await s.action(doc.id, 'issue')
        await posting(s, issued)
        expect(issued.document_number).toEqual(expect.any(String))
        await s.action(doc.id, 'void')
        await posting(s, issued, true)
        expect((await s.read(doc.id)).document_number).toBe(issued.document_number)
      } finally {
        await s.cleanup()
      }
    })
  }
})

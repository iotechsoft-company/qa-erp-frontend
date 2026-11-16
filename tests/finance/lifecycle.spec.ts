import { FinanceScenario } from '@api/finance-scenario'
import { expect, test } from '@fixtures/test'
import { debt, money, posting, rejected } from './support'

test.describe(
  'Finance core workflows (API path; no finance document UI in frontend)',
  { tag: ['@finance', '@regression', '@mutation'] },
  () => {
    test('A5 vendor bill → purchase return → vendor CREDIT_NOTE; AP/stock/GL reverse in dependency order', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new FinanceScenario(api, 'ap')
      try {
        await s.seed()
        const bill = await s.create(
          s.apInput({ items: [{ grn_item_id: s.source.source.items[0]!.id, qty: 4, unit_cost: 40 }] }),
        )
        expect(await s.ledger(bill.id)).toEqual([])
        await debt(s, 0)
        const posted = await s.action(bill.id, 'submit')
        expect(posted.status).toBe('SUBMITTED')
        expect(posted.document_number).toMatch(/^APINV-/)
        expect(posted).toMatchObject({
          net_amount: 160,
          vat_rate: s.vatRate,
          vat_amount: money((160 * s.vatRate) / 100),
          total: money(160 * (1 + s.vatRate / 100)),
        })
        await posting(s, posted)
        await debt(s, posted.total)
        const returned = await s.source.create(1)
        await s.source.action(returned.id, 'submit')
        const cn = await s.create(s.apInput({ document_type: 'CREDIT_NOTE', reference_ap_invoice_id: bill.id }))
        const credited = await s.action(cn.id, 'submit')
        expect(credited.document_number).toMatch(/^APCN-/)
        expect(credited).toMatchObject({
          reference_ap_invoice_id: bill.id,
          vat_rate: posted.vat_rate,
          net_amount: 40,
          vat_amount: money((40 * s.vatRate) / 100),
        })
        await posting(s, credited)
        await debt(s, money(posted.total - credited.total))
        const before = await s.ledger(bill.id)
        await rejected(
          await api.postResponse(`${s.path}/${bill.id}/cancel`, { cancel_reason: `${s.marker} ตรวจ guard` }),
          409,
          `AP invoice '${posted.document_number}' is still adjusted or credited by vendor credit note(s) ${credited.document_number} — cancel them before cancelling this bill.`,
        )
        expect(await s.ledger(bill.id)).toEqual(before)
        expect((await s.read(bill.id)).status).toBe('SUBMITTED')
        await s.action(cn.id, 'cancel')
        await posting(s, credited, true)
        await debt(s, posted.total)
        await s.action(bill.id, 'cancel')
        await posting(s, posted, true)
        await debt(s, 0)
        expect(await s.source.inventory.stockQty()).toBe(3)
      } finally {
        await s.cleanup()
      }
    })

    test('C1 tax invoice → C2 CN/DN → void: original taxes, AR and balanced GL conserve money; stock stays unchanged', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new FinanceScenario(api, 'ar')
      try {
        await s.seed()
        const original = await s.create(
          s.receiptInput({
            items: [{ product_id: s.productId, dn_item_id: s.source.source.items[0]!.id, qty: 4, unit_price: 150 }],
          }),
        )
        expect(original.document_number).toBeNull()
        expect(await s.ledger(original.id)).toEqual([])
        await debt(s, 0)
        const issued = await s.action(original.id, 'issue')
        expect(issued).toMatchObject({
          status: 'ISSUED',
          net_amount: 600,
          vat_rate: s.vatRate,
          vat_amount: money((600 * s.vatRate) / 100),
          total: money(600 * (1 + s.vatRate / 100)),
        })
        expect(issued.document_number).toEqual(expect.any(String))
        await posting(s, issued)
        await debt(s, issued.total)
        const children = []
        for (const type of ['CREDIT_NOTE', 'DEBIT_NOTE'] as const) {
          const draft = await s.create(
            s.receiptInput({
              document_type: type,
              reference_receipt_id: original.id,
              adjustment_reason: `${s.marker} ปรับราคาสินค้า`,
              delivery_note_id: undefined,
              items: [{ product_id: s.productId, qty: 1, unit_price: 150 }],
            }),
          )
          const doc = await s.action(draft.id, 'issue')
          children.push(doc)
          expect(doc).toMatchObject({
            reference_receipt_id: original.id,
            vat_rate: issued.vat_rate,
            is_vat_included: issued.is_vat_included,
            net_amount: 150,
          })
          await posting(s, doc)
          await debt(s, type === 'CREDIT_NOTE' ? money(issued.total - doc.total) : issued.total)
        }
        const before = await s.ledger(original.id)
        await rejected(
          await api.postResponse(`${s.path}/${original.id}/void`, { void_reason: `${s.marker} ตรวจ guard` }),
          409,
          `Receipt '${issued.document_number}' is still collected by credit/debit note(s) ${children
            .map((d) => d.document_number)
            .sort()
            .join(', ')} — cancel them before voiding.`,
        )
        expect(await s.ledger(original.id)).toEqual(before)
        for (const doc of children) {
          await s.action(doc.id, 'void')
          await posting(s, doc, true)
        }
        await debt(s, issued.total)
        await s.action(original.id, 'void')
        await posting(s, issued, true)
        await debt(s, 0)
        expect((await s.read(original.id)).document_number).toBe(issued.document_number)
        expect(await s.source.inventory.stockQty()).toBe(0)
      } finally {
        await s.cleanup()
      }
    })
  },
)

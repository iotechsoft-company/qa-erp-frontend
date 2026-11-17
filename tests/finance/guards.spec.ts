import { type ApiClient } from '@api/api-client'
import { FinanceScenario } from '@api/finance-scenario'
import { buildSupplier } from '@data/factories'
import { expect, test } from '@fixtures/test'
import { money, posting, rejected, snapshot } from './support'

async function removeSupplier(api: ApiClient, id: string) {
  if (id) await api.delete(`/supplier-bc/v1/suppliers/${id}`)
}
async function cleanupWithSupplier(s: FinanceScenario, id: string) {
  const results = await Promise.allSettled([removeSupplier(s.api, id), s.cleanup()])
  const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []))
  if (errors.length) throw new AggregateError(errors, 'Finance and secondary supplier cleanup failed')
}

test.describe(
  'Finance exact validation/state guards (API path)',
  { tag: ['@finance', '@api', '@regression', '@mutation'] },
  () => {
    for (const kind of ['ap', 'ar'] as const) {
      const post = kind === 'ap' ? 'submit' : 'issue'
      const reverse = kind === 'ap' ? 'cancel' : 'void'
      const prefix = kind === 'ap' ? 'AP invoice' : 'Receipt'
      const postedState = kind === 'ap' ? 'SUBMITTED' : 'ISSUED'
      const terminal = kind === 'ap' ? 'CANCELLED' : 'VOID'
      const overMessage = (line: string) =>
        kind === 'ap'
          ? `Cannot invoice 5 of goods receipt item '${line}': only 4 of the 4 received remain un-invoiced (0 already invoiced).`
          : `Cannot invoice 5 of delivered line '${line}': only 4 of the 4 delivered remain un-invoiced (0 already invoiced).`
      const inputFor = (s: FinanceScenario, qty: number) =>
        kind === 'ap'
          ? s.apInput({ items: [{ grn_item_id: s.source.source.items[0]!.id, qty, unit_cost: 40 }] })
          : s.receiptInput({
              items: [{ product_id: s.productId, dn_item_id: s.source.source.items[0]!.id, qty, unit_price: 150 }],
            })

      test(`${kind}: over-invoicing is rejected at create and authoritative submit/issue recheck`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new FinanceScenario(api, kind)
        try {
          await s.seed()
          const line = s.source.source.items[0]!.id
          const input = (qty: number) => inputFor(s, qty)
          const before = await snapshot(s)
          await rejected(await api.postResponse(s.path, input(5)), 409, overMessage(line))
          expect(await snapshot(s)).toEqual(before)
          const first = await s.create(input(3)),
            second = await s.create(input(2))
          const action = post
          const posted = await s.action(first.id, action)
          await posting(s, posted)
          const after = await snapshot(s)
          await rejected(
            await api.postResponse(`${s.path}/${second.id}/${action}`, {}),
            409,
            kind === 'ap'
              ? `Cannot invoice 2 of goods receipt item '${line}': only 1 remain un-invoiced — another invoice was submitted against this receipt in the meantime.`
              : `Cannot invoice 2 of delivered line '${line}': only 1 remain un-invoiced — another receipt was issued against this delivery in the meantime.`,
          )
          expect((await s.read(second.id)).status).toBe('DRAFT')
          expect(await snapshot(s)).toEqual(after)
        } finally {
          await s.cleanup()
        }
      })

      test(`${kind}: DRAFT source cannot be billed; duplicate lines and zero qty have no side effects`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new FinanceScenario(api, kind)
        try {
          await s.seed(false)
          const source = s.source.source
          const before = await snapshot(s)
          await rejected(
            await api.postResponse(s.path, s.input()),
            400,
            kind === 'ap'
              ? `Goods receipt '${source.grn_number}' has status 'DRAFT' — only a SUBMITTED receipt represents goods actually received and therefore billable.`
              : `Delivery note '${source.dn_number}' has status 'DRAFT' — only a SUBMITTED delivery represents goods actually shipped and therefore invoiceable.`,
          )
          expect(await snapshot(s)).toEqual(before)
          const input = s.input()
          const duplicate = { ...input, items: [input.items[0]!, input.items[0]!] }
          const line = source.items[0]!.id
          await rejected(
            await api.postResponse(s.path, duplicate),
            400,
            kind === 'ap'
              ? `Goods receipt item '${line}' appears more than once — combine the quantities into a single line.`
              : `Delivered line '${line}' appears more than once — combine the quantities into a single receipt line.`,
          )
          const invalid = s.input()
          invalid.items[0]!.qty = 0
          const response = await api.postResponse(s.path, invalid)
          expect(response.status()).toBe(400)
          expect(await response.json()).toMatchObject({ status: { code: 400001 } })
          expect(await snapshot(s)).toEqual(before)
        } finally {
          await s.cleanup()
        }
      })

      test(`${kind}: repeated posting/reversal rejects exactly and keeps ledger/source unchanged`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new FinanceScenario(api, kind)
        try {
          await s.seed()
          const draft = await s.create()
          const doc = await s.action(draft.id, post)
          await posting(s, doc)
          const before = await snapshot(s)
          await rejected(
            await api.postResponse(`${s.path}/${doc.id}/${post}`, {}),
            409,
            `${prefix} '${doc.id}' cannot move from ${postedState} to ${postedState}.`,
          )
          expect(await snapshot(s)).toEqual(before)
          await s.action(doc.id, reverse)
          await posting(s, doc, true)
          const after = await snapshot(s)
          await rejected(
            await api.postResponse(`${s.path}/${doc.id}/${reverse}`, {
              cancel_reason: `${s.marker} ซ้ำ`,
              void_reason: `${s.marker} ซ้ำ`,
            }),
            409,
            `${prefix} '${doc.id}' cannot move from ${terminal} to ${terminal}.`,
          )
          expect(await snapshot(s)).toEqual(after)
        } finally {
          await s.cleanup()
        }
      })
    }

    test('A5 supplier, current price tolerance and missing credit reference are checked before recording', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new FinanceScenario(api, 'ap')
      let supplier = ''
      try {
        await s.seed()
        const other = await api.create('/supplier-bc/v1/suppliers', buildSupplier())
        supplier = other.id
        const before = await snapshot(s),
          line = s.source.source.items[0]!.id
        await rejected(
          await api.postResponse(s.path, s.apInput({ supplier_id: supplier })),
          400,
          `Goods receipt item '${line}' belongs to supplier '${s.partyId}', not '${supplier}' — an invoice can only bill receipts from its own supplier.`,
        )
        const settings = await api.get<{ data: { attributes: { price_tolerance_percent: number } } }>(
          '/finance-bc/v1/finance-settings',
        )
        const tolerance = settings.data.attributes.price_tolerance_percent,
          lower = money(40 * (1 - tolerance / 100)),
          upper = money(40 * (1 + tolerance / 100)),
          price = upper + 1
        await rejected(
          await api.postResponse(s.path, s.apInput({ items: [{ grn_item_id: line, qty: 1, unit_cost: price }] })),
          400,
          `unit_cost for goods receipt item '${line}' (${price}) deviates more than ${tolerance}% from the reference price 40 — acceptable range is ${lower}–${upper}.`,
        )
        await rejected(
          await api.postResponse(s.path, s.apInput({ document_type: 'CREDIT_NOTE' })),
          400,
          'reference_ap_invoice_id is required for a CREDIT_NOTE — a credit note has to say which bill it reduces.',
        )
        expect(await snapshot(s)).toEqual(before)
      } finally {
        await cleanupWithSupplier(s, supplier)
      }
    })

    test('A5 vendor CN requires actual submitted purchase return and cannot exceed billed qty', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new FinanceScenario(api, 'ap')
      try {
        await s.seed()
        const bill = await s.create()
        const posted = await s.action(bill.id, 'submit')
        await posting(s, posted)
        const input = s.apInput({ document_type: 'CREDIT_NOTE', reference_ap_invoice_id: bill.id }),
          line = s.source.source.items[0]!.id
        const before = await snapshot(s)
        await rejected(
          await api.postResponse(s.path, input),
          409,
          `Cannot credit 1 of receipt line '${line}': only 0 have actually gone back to the supplier on a submitted Purchase Return. Raise the return first.`,
        )
        input.items[0]!.qty = 2
        await rejected(
          await api.postResponse(s.path, input),
          409,
          `Cannot credit 2 of receipt line '${line}': only 1 of the 1 billed on '${posted.document_number}' remain un-credited.`,
        )
        expect(await snapshot(s)).toEqual(before)
      } finally {
        await s.cleanup()
      }
    })

    test('C2 requires tax-invoice reference and reason; excessive CN rejected, draft adjustment cannot issue after parent void', async ({
      allowMutation,
      api,
    }) => {
      void allowMutation
      const s = new FinanceScenario(api, 'ar')
      try {
        await s.seed()
        const original = await s.create()
        const issued = await s.action(original.id, 'issue')
        await posting(s, issued)
        const input = s.receiptInput({
          document_type: 'CREDIT_NOTE',
          delivery_note_id: undefined,
          adjustment_reason: `${s.marker} ปรับราคา`,
          items: [{ product_id: s.productId, qty: 1, unit_price: 150 }],
        })
        const before = await snapshot(s)
        await rejected(
          await api.postResponse(s.path, input),
          400,
          "document_type 'CREDIT_NOTE' requires reference_receipt_id — a credit or debit note must name the tax invoice it adjusts (Revenue Code §86/22).",
        )
        input.reference_receipt_id = original.id
        input.adjustment_reason = ' '
        await rejected(
          await api.postResponse(s.path, input),
          400,
          "document_type 'CREDIT_NOTE' requires adjustment_reason — a credit or debit note must state the reason it was issued on the document itself (Revenue Code §86/10).",
        )
        input.adjustment_reason = `${s.marker} ปรับราคา`
        input.items[0]!.qty = 2
        const tooMuch = money(300 * (1 + s.vatRate / 100))
        await rejected(
          await api.postResponse(s.path, input),
          409,
          `Credit note total ${tooMuch} exceeds the ${issued.total} still standing on '${issued.document_number}' (its total, plus issued debit notes, minus issued credit notes).`,
        )
        expect(await snapshot(s)).toEqual(before)
        input.items[0]!.qty = 1
        const draft = await s.create(input)
        await s.action(original.id, 'void')
        await posting(s, issued, true)
        const after = await snapshot(s)
        await rejected(
          await api.postResponse(`${s.path}/${draft.id}/issue`, {}),
          409,
          `Cannot issue: '${issued.document_number}' is VOID — a §86/22 adjustment can only adjust a document that still stands. Delete this draft instead.`,
        )
        expect(await snapshot(s)).toEqual(after)
        expect((await s.read(draft.id)).document_number).toBeNull()
      } finally {
        await s.cleanup()
      }
    })
  },
)

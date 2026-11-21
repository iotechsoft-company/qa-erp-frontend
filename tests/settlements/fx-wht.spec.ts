import { SettlementScenario } from '@api/settlement-scenario'
import { expect, test } from '@fixtures/test'
import { balances, journal, money, rejected } from './support'

function fxRoles(kind: 'ar' | 'ap', rate: number, book: number, raw: number): Record<string, number> {
  const cash = money(raw * rate),
    difference = money(cash - book)
  const gain = kind === 'ar' ? difference > 0 : difference < 0
  return {
    CASH: kind === 'ar' ? cash : -cash,
    [kind === 'ar' ? 'ACCOUNTS_RECEIVABLE' : 'ACCOUNTS_PAYABLE']: kind === 'ar' ? -book : book,
    [gain ? 'FOREIGN_EXCHANGE_GAIN' : 'FOREIGN_EXCHANGE_LOSS']: gain ? -Math.abs(difference) : Math.abs(difference),
  }
}

function fxInvoiceInput(s: SettlementScenario) {
  return s.kind === 'ar'
    ? s.finance.receiptInput({
        currency: 'USD',
        currency_rate: 35,
        items: [
          {
            product_id: s.finance.productId,
            qty: 1,
            unit_price: 35,
          },
        ],
      })
    : s.finance.apInput({
        currency: 'USD',
        currency_rate: 35,
        items: [{ grn_item_id: s.finance.source.source.items[0]!.id, qty: 1, unit_cost: 35 }],
      })
}
function whtInput(s: SettlementScenario, code: string) {
  return s.kind === 'ar'
    ? s.finance.receiptInput({ wht_config_code: code })
    : s.finance.apInput({ wht_config_code: code })
}
function whtRoles(s: SettlementScenario, cash: number, wht: number, total: number): Record<string, number> {
  return s.kind === 'ar'
    ? { CASH: cash, WITHHOLDING_TAX_RECEIVABLE: wht, ACCOUNTS_RECEIVABLE: -total }
    : { CASH: -cash, WITHHOLDING_TAX_PAYABLE: -wht, ACCOUNTS_PAYABLE: total }
}

test.describe(
  'C4 FX and withholding (owned parties; settings read-only)',
  { tag: ['@finance', '@settlements', '@regression', '@mutation'] },
  () => {
    for (const kind of ['ar', 'ap'] as const) {
      const partyPath = kind === 'ar' ? '/sales-bc/v1/customers' : '/supplier-bc/v1/suppliers'
      for (const rate of [34, 36]) {
        test(`${kind}: USD booked at 35 settled at ${rate}; realised FX and cancellation`, async ({
          allowMutation,
          api,
        }) => {
          void allowMutation
          const s = new SettlementScenario(api, kind)
          try {
            await s.seed()
            await api.put(`${partyPath}/${s.partyId}`, { billing_currency: 'USD' })
            const input = fxInvoiceInput(s)
            const book = money(35 * (1 + s.finance.vatRate / 100))
            const raw = money(book / 35)
            const invoice = await s.newInvoice(input)
            expect(invoice).toMatchObject({ currency: 'USD', currency_rate: 35, total: book, raw_total: raw })
            await rejected(
              await api.postResponse(s.path('payment-entries'), s.paymentInput(10)),
              400,
              `${kind === 'ar' ? 'receipt' : 'AP invoice'} '${invoice.document_number}' is denominated in USD but this payment is in THB — a payment can only settle documents in its own currency.`,
            )
            const pay = await s.create(
              'payment-entries',
              s.paymentInput(money(raw * rate), book, invoice, { currency: 'USD', currency_rate: rate }),
            )
            const posted = await s.action('payment-entries', pay.id, 'submit')
            expect(posted).toMatchObject({
              raw_paid_amount: raw,
              paid_amount: money(raw * rate),
              allocated_amount: book,
              raw_allocated_amount: raw,
              unallocated_amount: 0,
            })
            await balances(s, 0)
            await journal(s, pay.id, fxRoles(kind, rate, book, raw))
            await s.action('payment-entries', pay.id, 'cancel')
            await balances(s, book)
            await journal(s, pay.id, fxRoles(kind, rate, book, raw), true)
          } finally {
            await s.cleanup()
          }
        })
      }

      test(`${kind}: current WHT reference splits cash/tax and settles gross; reversal restores debt`, async ({
        allowMutation,
        api,
      }) => {
        void allowMutation
        const s = new SettlementScenario(api, kind)
        try {
          await s.seed()
          const now = Date.now()
          const configs = await api.list<{
            code: string
            tax_type: string
            rate: number
            is_active: boolean
            effective_from: string
            effective_upto?: string | null
          }>('/finance-bc/v1/tax-configs', { ignore_limit: 'true' })
          const config = configs.find(
            (c) =>
              c.tax_type === 'wht' &&
              c.is_active &&
              c.rate > 0 &&
              new Date(c.effective_from).getTime() <= now &&
              (!c.effective_upto || new Date(c.effective_upto).getTime() >= now),
          )
          expect(
            config,
            'A current read-only WHT reference is required; never create global tax settings',
          ).toBeDefined()
          const input = whtInput(s, config!.code)
          const invoice = await s.newInvoice(input)
          const wht = money((invoice.net_amount * config!.rate) / 100)
          expect(invoice.total_wht).toBe(wht)
          const cash = money(invoice.total - wht)
          const pay = await s.create(
            'payment-entries',
            s.paymentInput(cash, invoice.total, invoice, { wht_amount: wht }),
          )
          expect(pay.allocations[0]!.wht_amount).toBe(wht)
          await s.action('payment-entries', pay.id, 'submit')
          await balances(s, 0)
          const roles = whtRoles(s, cash, wht, invoice.total)
          await journal(s, pay.id, roles)
          await s.action('payment-entries', pay.id, 'cancel')
          await balances(s, invoice.total)
          await journal(s, pay.id, roles, true)
        } finally {
          await s.cleanup()
        }
      })
    }
  },
)

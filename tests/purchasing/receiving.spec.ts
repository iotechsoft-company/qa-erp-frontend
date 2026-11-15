import { PurchasingScenario, type PurchaseRecord } from '@api/purchasing-scenario'
import { e2eCode } from '@data/factories'
import { expect, test } from '@fixtures/test'
import { expectOrder, expectRejection, ledger, lots, readOrder, snapshot } from './receiving-support'

const grPath = '/inventory-bc/v1/goods-receipts'
const poPath = '/supplier-bc/v1/purchase-orders'
const apiCancel = { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/7' }

test.describe('Purchasing receiving business workflow', { tag: ['@purchasing', '@regression', '@mutation'] }, () => {
  test(
    'UI partial receipt → PARTIAL → second receipt → RECEIVED; API cancel (#7)',
    { annotation: apiCancel },
    async ({ allowMutation, api, goodsReceiptsPage }) => {
      void allowMutation
      const s = new PurchasingScenario(api)
      try {
        await s.seed()
        const order = await s.createOrder(true, {
          items: [{ product_id: s.productId, qty: 5, unit_cost: 100, discount_type: 'amount', discount: 0 }],
        })
        await expectOrder(s, order.id, 'SENT', 5, 0)
        await goodsReceiptsPage.goto()
        await goodsReceiptsPage.search(order.po_number!)
        await goodsReceiptsPage.openReceive(order.po_number!)
        const first = await goodsReceiptsPage.receive(
          s.receiptWarehouseLabel,
          `${s.marker} รับบางส่วน`,
          e2eCode('LOT'),
          2,
        )
        await expectOrder(s, order.id, 'PARTIAL', 5, 2)
        await goodsReceiptsPage.goto()
        await goodsReceiptsPage.search(order.po_number!)
        await goodsReceiptsPage.openReceive(order.po_number!)
        const second = await goodsReceiptsPage.receive(s.receiptWarehouseLabel, `${s.marker} รับครบ`, e2eCode('LOT'), 3)
        await expectOrder(s, order.id, 'RECEIVED', 5, 5)
        expect((await lots(s)).map((l) => l.available_qty).sort()).toEqual([2, 3])
        // frontend#7: cancellation has no healthy UI control when PO is RECEIVED.
        await s.cancelReceipt(second.data.id)
        await expectOrder(s, order.id, 'PARTIAL', 5, 2)
        await s.cancelReceipt(first.data.id)
        await expectOrder(s, order.id, 'SENT', 5, 0)
      } finally {
        await s.cleanup()
      }
    },
  )

  test('API over-receipt rejects exact allowance error without changing partial PO/stock/lot/ledger', async ({
    allowMutation,
    api,
  }) => {
    void allowMutation
    const s = new PurchasingScenario(api)
    try {
      await s.seed()
      const order = await s.createOrder(true, {
        items: [{ product_id: s.productId, qty: 5, unit_cost: 100, discount_type: 'amount', discount: 0 }],
      })
      const firstInput = s.receiptInput(order)
      firstInput.items[0]!.qty = 2
      const first = await api.create<PurchaseRecord>(grPath, firstInput)
      await api.post(`${grPath}/${first.id}/submit`, {})
      await expectOrder(s, order.id, 'PARTIAL', 5, 2)
      const settings = await api.get<{ data: { attributes: { over_receipt_allowance: number } } }>(
        '/inventory-bc/v1/stock-settings',
      )
      const allowance = settings.data.attributes.over_receipt_allowance
      const max = 5 * (1 + allowance / 100)
      const qty = Math.floor(max - 2) + 1
      const input = s.receiptInput(order)
      input.items[0]!.qty = qty
      const invalid = await api.create<PurchaseRecord>(grPath, input)
      const before = await snapshot(s, order.id)
      const response = await api.postResponse(`${grPath}/${invalid.id}/submit`, {})
      await expectRejection(
        response,
        409,
        `Receiving ${qty} of product '${s.productId}' would take purchase order item '${order.items![0]!.id}' to ${2 + qty}, exceeding the allowed ${max} (qty 5 + ${allowance}% over-receipt allowance).`,
      )
      expect(await snapshot(s, order.id)).toEqual(before)
      expect(
        (await api.get<{ data: { attributes: PurchaseRecord } }>(`${grPath}/${invalid.id}`)).data.attributes.status,
      ).toBe('DRAFT')
    } finally {
      await s.cleanup()
    }
  })

  for (const state of ['DRAFT', 'CANCELLED'] as const) {
    const prepare =
      state === 'DRAFT'
        ? async (s: PurchasingScenario) => s.createOrder()
        : async (s: PurchasingScenario) => {
            const order = await s.createOrder(true)
            await s.api.post(`${poPath}/${order.id}/cancel`, { cancel_reason: `${s.marker} ทดสอบสถานะ` })
            return order
          }

    test(`API cannot create receipt for ${state} PO; no side effects`, async ({ allowMutation, api }) => {
      void allowMutation
      const s = new PurchasingScenario(api)
      try {
        await s.seed()
        const order = await prepare(s)
        const before = await snapshot(s, order.id)
        const response = await api.postResponse(grPath, s.receiptInput(order))
        await expectRejection(
          response,
          400,
          `Purchase order '${order.id}' has status '${state}' — only a SENT or PARTIAL purchase order can receive goods.`,
        )
        expect(await snapshot(s, order.id)).toEqual(before)
        expect(await api.list(grPath, { filter: `po_id||$eq||${order.id}` })).toEqual([])
      } finally {
        await s.cleanup()
      }
    })
  }

  test('API draft GR cannot submit after PO cancelled; no side effects', async ({ allowMutation, api }) => {
    void allowMutation
    const s = new PurchasingScenario(api)
    try {
      await s.seed()
      const order = await s.createOrder(true)
      const receipt = await api.create<PurchaseRecord>(grPath, s.receiptInput(order))
      await api.post(`${poPath}/${order.id}/cancel`, { cancel_reason: `${s.marker} ยกเลิกก่อนรับ` })
      const before = await snapshot(s, order.id)
      const response = await api.postResponse(`${grPath}/${receipt.id}/submit`, {})
      await expectRejection(
        response,
        400,
        `Purchase order '${order.id}' has status 'CANCELLED' — only a SENT or PARTIAL purchase order can receive goods.`,
      )
      expect(await snapshot(s, order.id)).toEqual(before)
      expect(
        (await api.get<{ data: { attributes: PurchaseRecord } }>(`${grPath}/${receipt.id}`)).data.attributes.status,
      ).toBe('DRAFT')
    } finally {
      await s.cleanup()
    }
  })

  test(
    'API receipt lot/ledger conserve qty/cost and reverse once; repeated submit/cancel rejected (#7)',
    { annotation: apiCancel },
    async ({ allowMutation, api }) => {
      void allowMutation
      const s = new PurchasingScenario(api)
      try {
        await s.seed()
        const order = await s.createOrder(true)
        const input = s.receiptInput(order)
        const receipt = await api.create<PurchaseRecord>(grPath, input)
        await expectOrder(s, order.id, 'SENT', 1, 0)
        expect(await lots(s)).toEqual([])
        expect(await ledger(s)).toEqual([])
        const submitted = await api.post<{ data: { attributes: { items: { lot_id: string; line_total: number }[] } } }>(
          `${grPath}/${receipt.id}/submit`,
          {},
        )
        await expectOrder(s, order.id, 'RECEIVED', 1, 1)
        expect(submitted.data.attributes.items).toEqual([
          expect.objectContaining({ line_total: 100, lot_id: expect.any(String) }),
        ])
        const lotId = submitted.data.attributes.items[0]!.lot_id
        expect(await lots(s)).toEqual([
          expect.objectContaining({
            id: lotId,
            product_id: s.productId,
            warehouse_id: s.warehouseId,
            supplier_id: s.supplierId,
            lot_number: input.items[0]!.lot_number,
            received_qty: 1,
            available_qty: 1,
            import_cost: 100,
          }),
        ])
        const entries = await ledger(s)
        expect(entries).toEqual([
          expect.objectContaining({
            lot_id: lotId,
            type: 'RECEIPT',
            qty: 1,
            unit_cost: 100,
            balance_before: 0,
            balance_after: 1,
            lot_balance_after: 1,
            source_doc_type: 'GOODS_RECEIPT',
            source_doc_id: receipt.id,
            source_doc_number: receipt.grn_number,
          }),
        ])
        const beforeRepeat = await snapshot(s, order.id)
        await expectRejection(
          await api.postResponse(`${grPath}/${receipt.id}/submit`, {}),
          409,
          `Goods receipt '${receipt.id}' cannot move from SUBMITTED to SUBMITTED.`,
        )
        expect(await snapshot(s, order.id)).toEqual(beforeRepeat)
        // API-path because frontend#7 hides GR cancellation for a RECEIVED PO.
        await s.cancelReceipt(receipt.id)
        await expectOrder(s, order.id, 'SENT', 1, 0)
        expect(await lots(s)).toEqual([
          expect.objectContaining({ id: lotId, received_qty: 1, available_qty: 0, import_cost: 100 }),
        ])
        const reversed = await ledger(s)
        expect(reversed).toHaveLength(2)
        expect(reversed).toEqual(
          expect.arrayContaining([
            ...entries,
            expect.objectContaining({
              lot_id: lotId,
              type: 'ADJUSTMENT',
              qty: -1,
              unit_cost: 100,
              balance_before: 1,
              balance_after: 0,
              lot_balance_after: 0,
              source_doc_type: 'GOODS_RECEIPT',
              source_doc_id: receipt.id,
            }),
          ]),
        )
        expect(reversed.reduce((sum, entry) => sum + entry.qty * entry.unit_cost, 0)).toBe(0)
        const beforeCancel = await snapshot(s, order.id)
        await expectRejection(
          await api.postResponse(`${grPath}/${receipt.id}/cancel`, { cancel_reason: `${s.marker} ซ้ำ` }),
          409,
          `Goods receipt '${receipt.id}' cannot move from CANCELLED to CANCELLED.`,
        )
        expect(await snapshot(s, order.id)).toEqual(beforeCancel)
      } finally {
        await s.cleanup()
      }
    },
  )
})

for (const mode of ['none', 'header', 'per_item', 'both'] as const) {
  const lineDiscount = ['per_item', 'both'].includes(mode) ? 200 : 0
  const headerDiscount = ['header', 'both'].includes(mode) ? (1000 - lineDiscount) * 0.1 : 0
  const applyLine = lineDiscount
    ? (page: import('@pages/purchase-create.page').PurchaseCreatePage, sku: string) => page.setLine(sku, 'ส่วนลด', '200')
    : async () => {}
  const applyHeader = headerDiscount
    ? (page: import('@pages/purchase-create.page').PurchaseCreatePage) => page.applyHeaderDiscount('10', 'percent')
    : async () => {}

  test(
    `UI PO discount ${mode}: qty × cost and independent totals`,
    { tag: ['@purchasing', '@regression', '@mutation'] },
    async ({ allowMutation, api, purchaseCreatePage }) => {
      void allowMutation
      const s = new PurchasingScenario(api)
      try {
        await s.seed()
        await purchaseCreatePage.goto()
        await purchaseCreatePage.selectMode('po')
        await purchaseCreatePage.selectSupplier(s.supplier.code)
        await purchaseCreatePage.addProduct(s.sku)
        await purchaseCreatePage.setLine(s.sku, 'จำนวน', '10')
        await purchaseCreatePage.setLine(s.sku, 'ราคาทุน/หน่วย', '100')
        await applyLine(purchaseCreatePage, s.sku)
        await applyHeader(purchaseCreatePage)
        await purchaseCreatePage.expectLineTotal(s.sku, 1000 - lineDiscount)
        await purchaseCreatePage.remark.fill(`${s.marker} ตรวจยอดส่วนลด`)
        const created = await purchaseCreatePage.submit('po')
        const order = await readOrder(api, created.data.id)
        expect(order).toMatchObject({
          discount_mode: mode,
          sub_total: 10 * 100,
          total_discount: lineDiscount + headerDiscount,
          total: 10 * 100 - lineDiscount - headerDiscount,
        })
        expect(order.items).toEqual([
          expect.objectContaining({
            product_id: s.productId,
            qty: 10,
            line_total: 1000 - lineDiscount,
            received_qty: 0,
          }),
        ])
        expect(await s.stockQty()).toBe(0)
      } finally {
        await s.cleanup()
      }
    },
  )
}

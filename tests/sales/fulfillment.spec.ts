import { SalesFulfillmentScenario } from '@api/sales-fulfillment-scenario'
import { expect, test } from '@fixtures/test'
import { stableReadFields } from '../purchasing/receiving-support'
import { expectFinancial, expectFinancialReversed, expectRejection, money, salePrice } from './fulfillment-support'

test.describe('Sales fulfillment business workflow', { tag: ['@sales', '@regression', '@mutation'] }, () => {
  test('UI QT→SO→draft DN→submit→stock/COGS/profit→cancel reversal', async ({
    allowMutation,
    api,
    salesCreatePage,
    deliveryNotesPage,
  }) => {
    void allowMutation
    const s = new SalesFulfillmentScenario(api)
    try {
      await s.seed()
      await salesCreatePage.goto()
      await salesCreatePage.selectMode('delivery')
      await salesCreatePage.selectCustomer(s.sales.customer.code)
      await salesCreatePage.selectWarehouse(s.sales.warehouseName)
      await salesCreatePage.addProduct(s.sales.sku)
      await salesCreatePage.setLine(s.sales.sku, 'ราคาขาย/หน่วย', '150')
      await salesCreatePage.remark.fill(`${s.sales.marker} ส่งอุปกรณ์สำนักงาน`)
      const created = await salesCreatePage.create('delivery')
      const data = (await created.json()).data
      s.trackNote(data.id)
      const draft = await s.note(data.id)
      const order = await s.order(draft.so_id)
      const quote = await api.get<{
        data: { attributes: { status: string; sales_order_id: string; remark: { th: string } } }
      }>(`/sales-bc/v1/quotations/${order.quotation_id}`)
      expect(draft.status).toBe('DRAFT')
      expect(order.is_vat_included).toEqual(expect.any(Boolean))
      const pricing = salePrice(150, order.vat_rate, order.is_vat_included)
      expect(order).toMatchObject({
        status: 'CONFIRMED',
        customer_id: s.sales.customerId,
        ...pricing,
        items: [expect.objectContaining({ product_id: s.sales.productId, qty: 1, delivered_qty: 0, line_total: 150 })],
      })
      expect(quote.data.attributes).toMatchObject({
        status: 'APPROVED',
        sales_order_id: draft.so_id,
        remark: { th: expect.stringMatching(new RegExp(`^${s.sales.marker}`)) },
      })
      await s.stock.expectUnchanged()
      expect(await s.costs()).toEqual([])
      expect(await s.profits()).toEqual([])
      await deliveryNotesPage.goto()
      await deliveryNotesPage.filterStatus('ฉบับร่าง', 'DRAFT')
      await deliveryNotesPage.findRecord(draft.dn_number)
      const submitted = await deliveryNotesPage.submit(draft.dn_number)
      expect(submitted.data.attributes.status).toBe('SUBMITTED')
      await expect.poll(() => s.stock.inventory.stockQty()).toBe(0)
      await expect(async () => {
        expect(await s.order(draft.so_id)).toMatchObject({
          status: 'CLOSED',
          items: [expect.objectContaining({ delivered_qty: 1 })],
        })
        expect(await s.costs()).toEqual([
          expect.objectContaining({
            sale_id: draft.items[0]!.id,
            product_id: s.sales.productId,
            qty: 1,
            unit_cost: 100,
            cogs: 100,
          }),
        ])
        expect(await s.profits()).toEqual([
          expect.objectContaining({
            sale_id: draft.items[0]!.id,
            customer_id: s.sales.customerId,
            revenue: pricing.net_amount,
            cogs: 100,
            gross_profit: money(pricing.net_amount - 100),
          }),
        ])
      }).toPass({ timeout: 10_000 })
      await expectFinancial(
        s,
        draft.items[0]!.id,
        [{ lotId: s.stock.lots[0]!.id, qty: 1, unitCost: 100 }],
        pricing.net_amount,
      )
      await deliveryNotesPage.goto()
      await deliveryNotesPage.filterStatus('ยืนยันส่งแล้ว', 'SUBMITTED')
      await deliveryNotesPage.findRecord(draft.dn_number)
      await deliveryNotesPage.cancel(draft.dn_number, `${s.sales.marker} คืนยอดหลังทดสอบ`)
      await expect.poll(() => s.stock.inventory.stockQty()).toBe(1)
      await expect(async () => {
        expect(await s.order(draft.so_id)).toMatchObject({
          status: 'CONFIRMED',
          items: [expect.objectContaining({ delivered_qty: 0 })],
        })
        expect(await s.costs()).toEqual([])
        expect(await s.profits()).toEqual([])
      }).toPass({ timeout: 10_000 })
      await expectFinancialReversed(s, draft.items[0]!.id, 100)
    } finally {
      await s.cleanup()
    }
  })

  test('API-linked DN drafts → UI partial/full shipment, configured lot strategy, discounted COGS and reversal', async ({
    allowMutation,
    api,
    deliveryNotesPage,
  }) => {
    void allowMutation
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString()
    const s = new SalesFulfillmentScenario(api, [
      { qty: 1, unitCost: 100, expiryDate: day(90) },
      { qty: 1, unitCost: 80, expiryDate: day(30) },
    ])
    try {
      await s.seed()
      const settings = await api.get<{ data: { attributes: { valuation_method: string } } }>(
        '/inventory-bc/v1/stock-settings',
      )
      const method = settings.data.attributes.valuation_method
      expect(['FIFO', 'FEFO']).toContain(method)
      test.info().annotations.push({ type: 'valuation-method', description: method })
      const allocations = { FIFO: s.stock.lots, FEFO: [...s.stock.lots].reverse() }[method]!
      const order = await s.newOrder(2, 150, 30)
      expect(order).toMatchObject({
        status: 'CONFIRMED',
        total: 288.9,
        items: [expect.objectContaining({ qty: 2, line_total: 270 })],
      })
      // Existing-SO selection is absent from the create UI; seed linked drafts via API.
      const first = await s.draft(order, 1)
      const send = async (
        draft: typeof first,
        delivered: number,
        status: string,
        lot: (typeof allocations)[number],
      ) => {
        await deliveryNotesPage.goto()
        // Scope real UI pagination to actionable notes rather than the growing cancelled audit history.
        await deliveryNotesPage.filterStatus('ฉบับร่าง', 'DRAFT')
        await deliveryNotesPage.findRecord(draft.dn_number)
        await deliveryNotesPage.submit(draft.dn_number)
        await expect.poll(() => s.stock.inventory.stockQty()).toBe(2 - delivered)
        await expect.poll(async () => (await s.order(order.id)).status).toBe(status)
        expect((await s.order(order.id)).items[0]!.delivered_qty).toBe(delivered)
        await expectFinancial(s, draft.items[0]!.id, [{ lotId: lot.id, qty: 1, unitCost: lot.unitCost }], 135)
        expect((await s.movements()).filter((row) => row.source_doc_id === draft.items[0]!.id)).toEqual([
          expect.objectContaining({
            type: 'ISSUE',
            qty: -1,
            lot_id: lot.id,
            unit_cost: lot.unitCost,
            source_doc_number: draft.dn_number,
          }),
        ])
      }
      await send(first, 1, 'PARTIAL', allocations[0]!)
      const before = await s.businessSnapshot(order.id)
      const rejected = await api.postResponse(`/sales-bc/v1/sales-orders/${order.id}/cancel`, {
        cancel_reason: `${s.sales.marker} ต้องปฏิเสธเมื่อส่งบางส่วน`,
      })
      await expectRejection(rejected, 409, `Sales order '${order.id}' cannot move from PARTIAL to CANCELLED.`)
      expect(await s.businessSnapshot(order.id)).toEqual(before)
      const second = await s.draft(order, 1)
      await send(second, 2, 'CLOSED', allocations[1]!)
      for (const [draft, lot, qty, status] of [
        [second, allocations[1]!, 1, 'PARTIAL'],
        [first, allocations[0]!, 2, 'CONFIRMED'],
      ] as const) {
        await deliveryNotesPage.goto()
        await deliveryNotesPage.filterStatus('ยืนยันส่งแล้ว', 'SUBMITTED')
        await deliveryNotesPage.findRecord(draft.dn_number)
        await deliveryNotesPage.cancel(draft.dn_number, `${s.sales.marker} คืนยอดส่งบางส่วน`)
        await expectFinancialReversed(s, draft.items[0]!.id, lot.unitCost)
        await expect.poll(() => s.stock.inventory.stockQty()).toBe(qty)
        await expect.poll(async () => (await s.order(order.id)).status).toBe(status)
      }
      await expect.poll(() => s.stock.inventory.stockQty()).toBe(2)
      expect(await s.order(order.id)).toMatchObject({
        status: 'CONFIRMED',
        items: [expect.objectContaining({ delivered_qty: 0 })],
      })
      expect((await s.lots()).map((row) => row.available_qty)).toEqual([1, 1])
    } finally {
      await s.cleanup()
    }
  })

  test('Owned credit limit → UI SO approval → DN credit hold → UI approval cuts stock once', async ({
    allowMutation,
    api,
    salesOrdersPage,
    deliveryNotesPage,
  }) => {
    void allowMutation
    const s = new SalesFulfillmentScenario(api)
    s.sales.customer.credit_limit = 50
    try {
      await s.seed()
      const order = await s.newOrder(1)
      expect(order.status).toBe('PENDING_APPROVAL')
      await salesOrdersPage.goto()
      await salesOrdersPage.filterStatus('รออนุมัติ', 'PENDING_APPROVAL')
      await salesOrdersPage.findRecord(order.so_number)
      await salesOrdersPage.approve(order.so_number)
      expect((await s.order(order.id)).status).toBe('CONFIRMED')
      const draft = await s.draft(order, 1)
      await deliveryNotesPage.goto()
      await deliveryNotesPage.filterStatus('ฉบับร่าง', 'DRAFT')
      await deliveryNotesPage.findRecord(draft.dn_number)
      const held = await deliveryNotesPage.submit(draft.dn_number)
      expect(held.data.attributes).toMatchObject({
        status: 'PENDING_APPROVAL',
        credit_limit_snapshot: 50,
        credit_exposure_snapshot: 150,
      })
      await s.stock.expectUnchanged()
      expect(await s.costs()).toEqual([])
      expect(await s.profits()).toEqual([])
      await deliveryNotesPage.goto()
      await deliveryNotesPage.filterStatus('รออนุมัติ', 'PENDING_APPROVAL')
      await deliveryNotesPage.findRecord(draft.dn_number)
      const approved = await deliveryNotesPage.approve(draft.dn_number)
      expect(approved.data.attributes.status).toBe('SUBMITTED')
      await expect.poll(() => s.stock.inventory.stockQty()).toBe(0)
      await expectFinancial(s, draft.items[0]!.id, [{ lotId: s.stock.lots[0]!.id, qty: 1, unitCost: 100 }], 150)
      await deliveryNotesPage.goto()
      await deliveryNotesPage.filterStatus('ยืนยันส่งแล้ว', 'SUBMITTED')
      await deliveryNotesPage.findRecord(draft.dn_number)
      await deliveryNotesPage.cancel(draft.dn_number, `${s.sales.marker} คืนยอดเครดิต`)
      await expectFinancialReversed(s, draft.items[0]!.id, 100)
      await expect.poll(() => s.stock.inventory.stockQty()).toBe(1)
    } finally {
      await s.cleanup()
    }
  })

  for (const scenario of [
    { title: 'insufficient stock', qty: 2, available: 1, lot: { qty: 1, unitCost: 100 } },
    {
      title: 'expired-only stock',
      qty: 1,
      available: 0,
      lot: { qty: 1, unitCost: 100, expiryDate: new Date(Date.now() - 86_400_000).toISOString() },
    },
  ]) {
    test(`UI rejects ${scenario.title} with exact conflict and unchanged owned state`, async ({
      allowMutation,
      api,
      quotationsPage,
    }) => {
      void allowMutation
      const s = new SalesFulfillmentScenario(api, [scenario.lot])
      try {
        await s.seed()
        const qty = scenario.qty
        const quote = await s.approvedQuotation(qty)
        const before = stableReadFields({ lots: await s.lots(), costs: await s.costs(), profits: await s.profits() })

        await quotationsPage.goto()
        await quotationsPage.filterStatus('ลูกค้าอนุมัติแล้ว', 'APPROVED')
        await quotationsPage.findRecord(quote.quotation_number!)
        const response = await quotationsPage.attemptConvert(quote.quotation_number!, quote.id)
        await expectRejection(
          response,
          409,
          `Insufficient stock to confirm this sales order: product '${s.sales.productId}' (requested ${qty}, available ${scenario.available}).`,
        )
        expect(await api.list('/sales-bc/v1/sales-orders', { filter: `quotation_id||$eq||${quote.id}` })).toEqual([])
        await s.stock.expectUnchanged()
        expect(stableReadFields({ lots: await s.lots(), costs: await s.costs(), profits: await s.profits() })).toEqual(
          before,
        )
      } finally {
        await s.cleanup()
      }
    })
  }

  test('UI DN submit rejects stock consumed after SO confirmation without side effects', async ({
    allowMutation,
    api,
    deliveryNotesPage,
  }) => {
    void allowMutation
    const s = new SalesFulfillmentScenario(api)
    try {
      await s.seed()
      const order = await s.newOrder(1)
      const competing = await s.newOrder(1)
      const consumed = await s.draft(competing, 1)
      await api.post(`/sales-bc/v1/delivery-notes/${consumed.id}/submit`, {})
      await expect.poll(() => s.stock.inventory.stockQty()).toBe(0)
      await expectFinancial(s, consumed.items[0]!.id, [{ lotId: s.stock.lots[0]!.id, qty: 1, unitCost: 100 }], 150)
      const draft = await s.draft(order, 1)
      const before = await s.businessSnapshot(order.id)
      await deliveryNotesPage.goto()
      await deliveryNotesPage.filterStatus('ฉบับร่าง', 'DRAFT')
      await deliveryNotesPage.findRecord(draft.dn_number)
      const rejected = await deliveryNotesPage.attemptSubmit(draft.dn_number, draft.id)
      await expectRejection(
        rejected,
        409,
        `Insufficient stock for product '${s.sales.productId}' in warehouse '${s.sales.warehouseId}': requested 1, available 0.`,
        // erp-api PR #17 (BE-08): retain the structured inventory code/meta through the RPC hop.
        'INSUFFICIENT_STOCK',
        { product_id: s.sales.productId, warehouse_id: s.sales.warehouseId, requested: 1, available: 0 },
      )
      expect((await s.note(draft.id)).status).toBe('DRAFT')
      expect(await s.businessSnapshot(order.id)).toEqual(before)
      expect(await s.journals(draft.items[0]!.id)).toEqual([])
    } finally {
      await s.cleanup()
    }
  })
})

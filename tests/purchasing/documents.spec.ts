import { PurchasingScenario, type PurchaseRecord } from '@api/purchasing-scenario'
import { e2eCode } from '@data/factories'
import { type PurchaseCreatePage } from '@pages/purchase-create.page'
import { type PurchaseDocumentsPage } from '@pages/purchase-documents.page'
import { expect, test } from '@fixtures/test'

for (const key of ['purchaseOrdersPage', 'goodsReceiptsPage'] as const) {
  const prepare = key === 'goodsReceiptsPage' ? (list: PurchaseDocumentsPage) => list.completed() : async () => {}

  test.describe(`${key} list`, { tag: ['@purchasing', '@smoke'] }, () => {
    test('list และค้นหาเลขที่เอกสารที่ไม่มีอยู่', async ({ purchaseOrdersPage, goodsReceiptsPage }) => {
      const list = { purchaseOrdersPage, goodsReceiptsPage }[key]
      await list.goto()
      await prepare(list)
      await list.search('E2E-NO-SUCH-DOCUMENT-!')
      await expect(list.dataTable.root.getByText(list.emptyText, { exact: true })).toBeVisible()
    })

    test('filter สถานะยกเลิกและ reset', async ({ purchaseOrdersPage, goodsReceiptsPage, page }) => {
      const list = { purchaseOrdersPage, goodsReceiptsPage }[key]
      await list.goto()
      await prepare(list)
      await list.filterStatus('ยกเลิกแล้ว', 'CANCELLED')
      await page.getByRole('button', { name: 'ล้างตัวกรอง', exact: true }).click()
      await expect(page.getByRole('combobox').filter({ hasText: 'สถานะ ทั้งหมด' })).toBeVisible()
    })

    test('pagination และ server sort ตาม created_at', async ({ purchaseOrdersPage, goodsReceiptsPage, page }) => {
      const list = { purchaseOrdersPage, goodsReceiptsPage }[key]
      const result = page.waitForResponse(
        (res) =>
          new URL(res.url()).pathname === '/api/supplier-bc/v1/purchase-orders' && res.request().method() === 'GET',
      )
      await list.goto()
      const response = await result
      expect(new URL(response.url()).searchParams.get('sort')).toBe('created_at:desc,po_number:desc')
      await prepare(list)
      await list.expectPagination()
    })
  })
}

test.describe('Purchasing UI', { tag: ['@purchasing', '@regression', '@mutation'] }, () => {
  test('create PO → list → details', async ({ allowMutation, api, purchaseCreatePage, purchaseOrdersPage }) => {
    void allowMutation
    const s = new PurchasingScenario(api)
    try {
      await s.seed()
      await purchaseCreatePage.goto()
      await purchaseCreatePage.selectMode('po')
      await purchaseCreatePage.selectSupplier(s.supplier.code)
      await purchaseCreatePage.addProduct(s.sku)
      await purchaseCreatePage.setLine(s.sku, 'ราคาทุน/หน่วย', '100')
      await purchaseCreatePage.remark.fill(s.orderInput().remark_th)
      const created = await purchaseCreatePage.submit('po')
      const number = created.data.attributes.po_number!
      await purchaseOrdersPage.goto()
      await purchaseOrdersPage.filterStatus('แบบร่าง', 'DRAFT')
      await purchaseOrdersPage.search(number)
      await expect(purchaseOrdersPage.dataTable.row(number)).toContainText(s.supplier.name_th)
      await purchaseOrdersPage.openDetails(number)
      await expect(purchaseOrdersPage.dialog).toContainText(s.productName)
      await purchaseOrdersPage.closeDialog()
    } finally {
      await s.cleanup()
    }
  })

  test('PO approve → send → cancel และเหตุผลว่าง', async ({ allowMutation, api, purchaseOrdersPage }) => {
    void allowMutation
    const s = new PurchasingScenario(api)
    try {
      await s.seed()
      const order = await s.createOrder()
      const number = order.po_number!
      await purchaseOrdersPage.goto()
      await purchaseOrdersPage.filterStatus('แบบร่าง', 'DRAFT')
      await purchaseOrdersPage.search(number)
      await purchaseOrdersPage.lifecycle(number, 'approve')
      await purchaseOrdersPage.filterStatus('อนุมัติแล้ว', 'APPROVED')
      await expect(purchaseOrdersPage.dataTable.row(number)).toContainText('อนุมัติแล้ว')
      await purchaseOrdersPage.lifecycle(number, 'send')
      await purchaseOrdersPage.filterStatus('ส่งแล้ว', 'SENT')
      await purchaseOrdersPage.openCancel(number)
      await expect(purchaseOrdersPage.confirmCancel).toBeDisabled()
      await purchaseOrdersPage.cancelReason.fill('   ')
      await expect(purchaseOrdersPage.confirmCancel).toBeDisabled()
      await purchaseOrdersPage.confirmCancellation(`${s.marker} ยกเลิกคำสั่งซื้อ`)
      const actual = await api.get<{ data: { attributes: { status: string } } }>(
        `/supplier-bc/v1/purchase-orders/${order.id}`,
      )
      expect(actual.data.attributes.status).toBe('CANCELLED')
    } finally {
      await s.cleanup()
    }
  })

  test('รับ PO ผ่าน UI → เพิ่ม stock → API cancel คืน stock (#7 blocks UI)', async ({
    allowMutation,
    api,
    goodsReceiptsPage,
  }) => {
    void allowMutation
    const s = new PurchasingScenario(api)
    try {
      await s.seed()
      const order = await s.createOrder(true)
      expect(await s.stockQty()).toBe(0)
      await goodsReceiptsPage.goto()
      await goodsReceiptsPage.search(order.po_number!)
      await goodsReceiptsPage.openReceive(order.po_number!)
      const receipt = await goodsReceiptsPage.receive(
        s.receiptWarehouseLabel,
        `${s.marker} รับอุปกรณ์เข้าคลัง`,
        e2eCode('LOT'),
      )
      await expect.poll(() => s.stockQty()).toBe(1)
      await goodsReceiptsPage.completed()
      await goodsReceiptsPage.search(receipt.data.attributes.grn_number)
      const cancelled = await s.cancelReceipt(receipt.data.id)
      expect(cancelled.status).toBe('CANCELLED')
      await expect
        .poll(
          async () =>
            (
              await api.get<{ data: { attributes: { status: string } } }>(
                `/supplier-bc/v1/purchase-orders/${cancelled.po_id}`,
              )
            ).data.attributes.status,
        )
        .toBe('SENT')
      await expect.poll(() => s.stockQty()).toBe(0)
    } finally {
      await s.cleanup()
    }
  })

  test('create GR mode → stock เพิ่ม → API cancel คืนยอด (#7 blocks UI)', async ({
    allowMutation,
    api,
    purchaseCreatePage,
    goodsReceiptsPage,
  }) => {
    void allowMutation
    const s = new PurchasingScenario(api)
    try {
      await s.seed()
      await purchaseCreatePage.goto()
      await purchaseCreatePage.selectMode('gr')
      await purchaseCreatePage.selectSupplier(s.supplier.code)
      await purchaseCreatePage.selectWarehouse(s.createWarehouseLabel)
      await purchaseCreatePage.addProduct(s.sku)
      await purchaseCreatePage.setLine(s.sku, 'ราคาทุน/หน่วย', '100')
      await purchaseCreatePage.remark.fill(`${s.marker} รับอุปกรณ์เข้าคลัง`)
      const receipt = await purchaseCreatePage.submit('gr')
      await expect.poll(() => s.stockQty()).toBe(1)
      await goodsReceiptsPage.goto()
      await goodsReceiptsPage.completed()
      await goodsReceiptsPage.search(receipt.data.attributes.grn_number!)
      const cancelled = await s.cancelReceipt(receipt.data.id)
      expect(cancelled.status).toBe('CANCELLED')
      await expect
        .poll(
          async () =>
            (
              await api.get<{ data: { attributes: { status: string } } }>(
                `/supplier-bc/v1/purchase-orders/${cancelled.po_id}`,
              )
            ).data.attributes.status,
        )
        .toBe('SENT')
      await expect.poll(() => s.stockQty()).toBe(0)
    } finally {
      await s.cleanup()
    }
  })

  test(
    'known bug #7: submitted GR has no cancel control when its PO is received',
    {
      annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/7' },
    },
    async ({ allowMutation, api, goodsReceiptsPage }) => {
      void allowMutation
      const s = new PurchasingScenario(api)
      try {
        await s.seed()
        const order = await s.createOrder(true)
        const receipt = await api.create<PurchaseRecord>('/inventory-bc/v1/goods-receipts', s.receiptInput(order))
        const submitted = await api.post<{ data: { attributes: PurchaseRecord } }>(
          `/inventory-bc/v1/goods-receipts/${receipt.id}/submit`,
          {},
        )
        expect(submitted.data.attributes.status).toBe('SUBMITTED')
        await expect.poll(() => s.stockQty()).toBe(1)
        await goodsReceiptsPage.goto()
        await goodsReceiptsPage.completed()
        await goodsReceiptsPage.search(receipt.grn_number!)
        await expect(goodsReceiptsPage.dataTable.row(receipt.grn_number!)).toBeVisible()
        await expect(
          goodsReceiptsPage.dataTable.row(receipt.grn_number!).getByRole('button', { name: /ยกเลิก/ }),
        ).toHaveCount(0)
        await goodsReceiptsPage.openDetails(receipt.grn_number!)
        await expect(goodsReceiptsPage.dialog).toContainText(s.productName)
        await expect(goodsReceiptsPage.dialog.getByRole('button', { name: /ยกเลิก/ })).toHaveCount(0)
        await goodsReceiptsPage.closeDialog()
        await s.cancelReceipt(receipt.id)
        await expect.poll(() => s.stockQty()).toBe(0)
      } finally {
        await s.cleanup()
      }
    },
  )

  for (const mode of ['po', 'gr'] as const) {
    const warehouse =
      mode === 'gr'
        ? (page: PurchaseCreatePage, s: PurchasingScenario) => page.selectWarehouse(s.createWarehouseLabel)
        : async () => {}

    test(`validation ${mode}: วันที่เอกสารและจำนวนศูนย์`, async ({ allowMutation, api, purchaseCreatePage, page }) => {
      void allowMutation
      const s = new PurchasingScenario(api)
      try {
        await s.seed()
        await purchaseCreatePage.goto()
        await purchaseCreatePage.selectMode(mode)
        await warehouse(purchaseCreatePage, s)
        await purchaseCreatePage.selectSupplier(s.supplier.code)
        await purchaseCreatePage.addProduct(s.sku)
        await purchaseCreatePage.documentDate.fill('')
        await purchaseCreatePage.saveButton(mode).click()
        await expect(purchaseCreatePage.alert).toContainText('กรุณาระบุวันที่เอกสาร')
        await purchaseCreatePage.documentDate.fill(s.orderInput().document_date.slice(0, 10))
        await purchaseCreatePage.setLine(s.sku, 'จำนวน', '0')
        await purchaseCreatePage.saveButton(mode).click()
        await expect(purchaseCreatePage.alert).toContainText('พบรายการสินค้าที่มีจำนวนเป็น 0 ไม่สามารถทำรายการได้')
        await expect(page.getByRole('dialog')).toContainText('ยืนยันการลบรายการสินค้าที่จำนวนเป็น 0')
      } finally {
        await s.cleanup()
      }
    })
  }

  for (const kind of ['po', 'gr'] as const) {
    const prepare =
      kind === 'po'
        ? (list: PurchaseDocumentsPage) => list.filterStatus('แบบร่าง', 'DRAFT')
        : (list: PurchaseDocumentsPage) => list.completed()
    const create = async (s: PurchasingScenario) => {
      const order = await s.createOrder(kind === 'gr')
      return kind === 'po'
        ? order
        : s.api.create<PurchaseRecord>('/inventory-bc/v1/goods-receipts', s.receiptInput(order))
    }

    test(
      `known bug #6: ${kind} draft has no edit/delete controls`,
      { annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/6' } },
      async ({ allowMutation, api, purchaseOrdersPage, goodsReceiptsPage }) => {
        void allowMutation
        const s = new PurchasingScenario(api)
        try {
          await s.seed()
          const doc = await create(s)
          const number = { po: doc.po_number, gr: doc.grn_number }[kind]!
          const list = { po: purchaseOrdersPage, gr: goodsReceiptsPage }[kind]
          await list.goto()
          await prepare(list)
          await list.search(number)
          expect(doc.status).toBe('DRAFT')
          await expect(list.dataTable.row(number)).toContainText('แบบร่าง')
          await expect(list.dataTable.row(number).getByRole('button', { name: 'แก้ไข', exact: true })).toHaveCount(0)
          await expect(list.dataTable.row(number).getByRole('button', { name: 'ลบ', exact: true })).toHaveCount(0)
          await list.openDetails(number)
          await expect(list.dialog).toContainText(s.productName)
          await expect(list.dialog.getByRole('button', { name: 'แก้ไข', exact: true })).toHaveCount(0)
          await expect(list.dialog.getByRole('button', { name: 'ลบ', exact: true })).toHaveCount(0)
          await list.closeDialog()
        } finally {
          await s.cleanup()
        }
      },
    )
  }
})

for (const mode of ['po', 'gr'] as const) {
  test(`empty create ${mode} cannot save`, { tag: ['@purchasing', '@smoke'] }, async ({ purchaseCreatePage }) => {
    await purchaseCreatePage.goto()
    await purchaseCreatePage.selectMode(mode)
    await expect(purchaseCreatePage.saveButton(mode)).toBeDisabled()
  })
}

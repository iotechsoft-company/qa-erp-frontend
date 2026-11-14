import { PurchasingScenario, type PurchaseRecord } from '@api/purchasing-scenario'
import { expect, test } from '@fixtures/test'

test.describe('Purchasing factories', { tag: ['@purchasing', '@api', '@regression', '@mutation'] }, () => {
  for (const kind of ['purchase-orders', 'goods-receipts'] as const) {
    const prefix = kind === 'purchase-orders' ? 'supplier-bc' : 'inventory-bc'
    const create = async (scenario: PurchasingScenario) => {
      const order = await scenario.createOrder(kind === 'goods-receipts')
      return kind === 'purchase-orders'
        ? order
        : scenario.api.create<PurchaseRecord>('/inventory-bc/v1/goods-receipts', scenario.receiptInput(order))
    }

    for (const operation of ['create/read/delete', 'update'] as const) {
      const annotation =
        operation === 'update'
          ? { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-api/issues/14' }
          : { type: 'contract', description: 'DTO create/read/delete without intermittent PUT' }
      const exercise =
        operation === 'update'
          ? async (scenario: PurchasingScenario, path: string) => {
              const remark = `${scenario.marker} ปรับกำหนดรับสินค้า`
              const updated = await scenario.api.put<{ data: { attributes: { remark: { th: string } } } }>(path, {
                remark_th: remark,
              })
              expect(updated.data.attributes.remark.th).toBe(remark)
            }
          : async () => {}

      test(`${kind}: draft ${operation}`, { annotation }, async ({ allowMutation, api }) => {
        test.fixme(operation === 'update', 'erp-api#14: intermittent PUT 404 after POST and GET; no write retries')
        void allowMutation
        const scenario = new PurchasingScenario(api)
        try {
          await scenario.seed()
          const document = await create(scenario)
          const path = `/${prefix}/v1/${kind}/${document.id}`
          await expect(async () => {
            const read = await api.get<{ data: { id: string; attributes: { status: string } } }>(path)
            expect(read.data.id).toBe(document.id)
            expect(read.data.attributes.status).toBe('DRAFT')
          }).toPass({ timeout: 10_000 })
          await exercise(scenario, path)
          await api.delete(path)
          expect(await api.list(path.slice(0, path.lastIndexOf('/')), { filter: `id||$eq||${document.id}` })).toEqual(
            [],
          )
        } finally {
          await scenario.cleanup()
        }
      })
    }
  }
  for (const kind of ['po', 'gr'] as const) {
    const invalidInput = async (s: PurchasingScenario) => {
      const input = kind === 'po' ? s.orderInput() : s.receiptInput(await s.createOrder(true))
      input.items[0]!.qty = 0
      return input
    }
    const path = kind === 'po' ? '/supplier-bc/v1/purchase-orders' : '/inventory-bc/v1/goods-receipts'

    test(`${kind}: zero quantity rejected by DTO`, async ({ allowMutation, api }) => {
      void allowMutation
      const s = new PurchasingScenario(api)
      try {
        await s.seed()
        const response = await api.postResponse(path, await invalidInput(s))
        expect(response.status()).toBe(400)
        expect(await response.json()).toMatchObject({
          status: { code: 400001 },
          errors: [
            {
              code: 'VALIDATION_ERROR',
              detail: 'qty must be a positive number',
              source: { pointer: '/data/attributes/items.0.qty' },
            },
          ],
        })
      } finally {
        await s.cleanup()
      }
    })
  }
})

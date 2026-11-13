import { SalesScenario } from '@api/sales-scenario'
import { expect, test } from '@fixtures/test'

test.describe('Sales factories ↔ API', { tag: ['@sales', '@api', '@regression', '@mutation'] }, () => {
  for (const update of [false, true]) {
    const annotation = update
      ? {
          type: 'issue',
          description: 'https://github.com/iotechsoft-company/erp-api/issues/14',
        }
      : { type: 'contract', description: 'Create/read/delete without intermittent PUT' }

    test(
      `quotation draft ${update ? 'update' : 'create → read → delete'}`,
      { annotation },
      async ({ allowMutation, api }) => {
        test.fixme(update, 'PUT intermittently returns 404; isolated pending investigation, no write retries')
        void allowMutation
        const scenario = new SalesScenario(api)
        try {
          await scenario.seed()
          const quote = await scenario.createQuotation()
          expect(quote.status).toBe('DRAFT')
          const path = `/sales-bc/v1/quotations/${quote.id}`
          await expect(async () => {
            const read = await api.get<{ data: { id: string; attributes: { status: string } } }>(path)
            expect(read.data.id).toBe(path.split('/').at(-1))
            expect(read.data.attributes.status).toBe('DRAFT')
          }).toPass({ timeout: 10_000 })
          // Separate update contracts are quarantined; create/read/delete stays active.
          // eslint-disable-next-line playwright/no-conditional-in-test
          if (update) {
            const updated = await api.put<{ data: { attributes: { remark: { th: string } } } }>(path, {
              remark_th: `${scenario.marker} ปรับกำหนดส่งสินค้า`,
            })
            // eslint-disable-next-line playwright/no-conditional-expect
            expect(updated.data.attributes.remark.th).toBe(`${scenario.marker} ปรับกำหนดส่งสินค้า`)
          }
          await api.delete(path)
          expect(await api.list('/sales-bc/v1/quotations', { filter: `id||$eq||${quote.id}` })).toEqual([])
        } finally {
          await scenario.cleanup()
        }
      },
    )

    test(
      `delivery-note draft ${update ? 'update' : 'create → read → delete'} via a converted order`,
      { annotation },
      async ({ allowMutation, api }) => {
        test.fixme(update, 'PUT intermittently returns 404; isolated pending investigation, no write retries')
        void allowMutation
        const scenario = new SalesScenario(api)
        try {
          await scenario.seed()
          const order = await scenario.createOrder()
          expect(['CONFIRMED', 'PENDING_APPROVAL']).toContain(order.status)
          const note = await api.create<{ status: string }>(
            '/sales-bc/v1/delivery-notes',
            scenario.deliveryInput(order),
          )
          expect(note.status).toBe('DRAFT')
          const path = `/sales-bc/v1/delivery-notes/${note.id}`
          await expect(async () => {
            const read = await api.get<{ data: { id: string; attributes: { status: string } } }>(path)
            expect(read.data.id).toBe(path.split('/').at(-1))
            expect(read.data.attributes.status).toBe('DRAFT')
          }).toPass({ timeout: 10_000 })
          // Separate update contracts are quarantined; create/read/delete stays active.
          // eslint-disable-next-line playwright/no-conditional-in-test
          if (update) {
            const updated = await api.put<{ data: { attributes: { remark: { th: string } } } }>(path, {
              remark_th: `${scenario.marker} จัดส่งช่วงเช้า`,
            })
            // eslint-disable-next-line playwright/no-conditional-expect
            expect(updated.data.attributes.remark.th).toBe(`${scenario.marker} จัดส่งช่วงเช้า`)
          }
          await api.delete(path)
          expect(await api.list('/sales-bc/v1/delivery-notes', { filter: `id||$eq||${note.id}` })).toEqual([])
        } finally {
          await scenario.cleanup()
        }
      },
    )
  }
})

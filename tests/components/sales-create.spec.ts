import { expect, test } from '@fixtures/test'
import { fakeSalesCreate } from '../helpers/fake-sales-create'

test.describe('Sales create POM transport safety', { tag: ['@sales', '@regression'] }, () => {
  test('QT 400 fails on its exact response instead of waiting for conversion', async ({ page, salesCreatePage }) => {
    const server = await fakeSalesCreate('qt-reject')
    try {
      await page.goto(server.url)
      await expect(salesCreatePage.create('order')).rejects.toThrow('POST /api/sales-bc/v1/quotations returned 400')
      expect(server.calls).toEqual(['/api/sales-bc/v1/quotations'])
    } finally {
      await server.close()
    }
  })

  test('waits for follow-up SO approval and the named success dialog', async ({ page, salesCreatePage }) => {
    const server = await fakeSalesCreate('pending-approval')
    try {
      await page.goto(server.url)
      const created = salesCreatePage.create('order')
      await Promise.race([
        server.approveRequested,
        created.then(() => {
          throw new Error('Create completed before the approval request')
        }),
      ])
      await expect(salesCreatePage.successDialog).toBeHidden()
      server.releaseApprove()
      const response = await created
      expect(new URL(response.url()).pathname).toBe('/api/sales-bc/v1/sales-orders/local-so/approve')
      expect((await response.json()).data.attributes.status).toBe('CONFIRMED')
      await expect(page.getByRole('dialog', { name: 'พักการขาย', exact: true })).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('reports missing document number explicitly with another dialog open', async ({ page, salesCreatePage }) => {
    const server = await fakeSalesCreate('missing-number')
    try {
      await page.goto(server.url)
      await expect(salesCreatePage.create('quotation')).rejects.toThrow(
        'Sales create response missing quotation_number',
      )
    } finally {
      await server.close()
    }
  })
})

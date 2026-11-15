import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import { expect, test } from '@fixtures/test'

/** Real CLI, isolated transport. A decoy E2E-external record must never be written. */
async function cleanup(apply: boolean, refuseReceipt = false) {
  const writes: string[] = []
  let stock = 100
  const documents = [
    {
      id: 'receipt',
      resource: 'stock-entries',
      status: 'SUBMITTED',
      submitted_at: '2026-01-01T01:00:00Z',
      created_at: '2026-01-01T01:00:00Z',
    },
    {
      id: 'issue',
      resource: 'stock-entries',
      status: 'SUBMITTED',
      submitted_at: '2026-01-01T03:00:00Z',
      created_at: '2026-01-01T03:00:00Z',
    },
    {
      id: 'adjustment',
      resource: 'stock-adjustments',
      status: 'SUBMITTED',
      submitted_at: '2026-01-01T02:00:00Z',
      approved_at: '2026-01-01T04:00:00Z',
      created_at: '2026-01-01T02:00:00Z',
    },
    {
      id: 'pending',
      resource: 'stock-adjustments',
      status: 'PENDING_APPROVAL',
      submitted_at: '2026-01-01T05:00:00Z',
      created_at: '2026-01-01T05:00:00Z',
    },
  ]
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname
    response.setHeader('Content-Type', 'application/json')
    const send = (data: unknown) => response.end(JSON.stringify({ data }))
    if (path.endsWith('/login')) {
      response.end(JSON.stringify({ access_token: 'local-stub' }))
      return
    }
    const doc = documents.find((row) => path.includes(`/${row.resource}/${row.id}`))
    if (request.method !== 'GET') {
      writes.push(`${request.method} ${path}`)
      if (doc) {
        if (path.endsWith('/approve')) {
          doc.status = 'SUBMITTED'
          stock = 200
        }
        if (path.endsWith('/cancel')) {
          const next = { pending: [200, 100], adjustment: [100, 9], issue: [9, 10], receipt: [10, 0] }[doc.id]!
          if (stock !== next[0] || (doc.id === 'receipt' && refuseReceipt)) {
            response.statusCode = 409
            response.end('{}')
            return
          }
          stock = next[1]!
          doc.status = 'CANCELLED'
        }
      }
      response.statusCode = 204
      response.end()
      return
    }
    if (doc) {
      send({ id: doc.id, attributes: doc })
      return
    }
    if (path.endsWith('/stock-entries') || path.endsWith('/stock-adjustments')) {
      const resource = path.split('/').at(-1)
      send([
        ...documents
          .filter((row) => row.resource === resource)
          .map((row) => ({ id: row.id, attributes: { ...row, remark: { th: `E2E-CLI-${row.id}` } } })),
        { id: 'foreign', attributes: { status: 'SUBMITTED', remark: { th: 'REAL DOCUMENT' } } },
      ])
      return
    }
    if (path.endsWith('/products')) {
      send([
        { id: 'owned-product', attributes: { sku: 'E2E-CLI-PRODUCT' } },
        { id: 'real-product', attributes: { sku: 'REAL-PRODUCT' } },
      ])
      return
    }
    if (path.endsWith('/stock-balances')) {
      send([{ id: 'balance', attributes: { total_qty: stock } }])
      return
    }
    send([])
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Local server has no port')
  try {
    try {
      const result = await promisify(execFile)(
        process.execPath,
        ['scripts/cleanup-e2e-data.ts', ...(apply ? ['--apply'] : [])],
        {
          timeout: 25_000,
          env: { BASE_URL: `http://127.0.0.1:${address.port}`, E2E_USERNAME: 'local-stub', E2E_PASSWORD: 'local-stub' },
        },
      )
      return { code: 0, ...result, writes }
    } catch (error) {
      return { ...(error as { code: number; stdout: string; stderr: string }), writes }
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

test.describe('D1/D2 cleanup CLI safety (localhost only)', { tag: ['@stock', '@api', '@regression'] }, () => {
  test('dry-run performs no approval/cancellation/deletion', async () => {
    const result = await cleanup(false)
    expect(result.writes).toEqual([])
    expect(result.stdout).toContain('approve-cancel')
  })

  test('effective posting order, pending workaround and ownership filter preserve stock before master deletion', async () => {
    const result = await cleanup(true)
    expect(result.code).toBe(0)
    expect(result.writes).toEqual([
      'POST /api/inventory-bc/v1/stock-adjustments/pending/approve',
      'POST /api/inventory-bc/v1/stock-adjustments/pending/cancel',
      'POST /api/inventory-bc/v1/stock-adjustments/adjustment/cancel',
      'POST /api/inventory-bc/v1/stock-entries/issue/cancel',
      'POST /api/inventory-bc/v1/stock-entries/receipt/cancel',
      'DELETE /api/inventory-bc/v1/products/owned-product',
    ])
  })

  test('failed stock-entry reversal keeps owned product and exits nonzero', async () => {
    const result = await cleanup(true, true)
    expect(result.code).toBe(1)
    expect(result.writes).not.toContain('DELETE /api/inventory-bc/v1/products/owned-product')
    expect(result.stderr).toContain('stock nonzero or unreadable; refusing deletion')
  })
})

import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import { expect, test } from '@fixtures/test'

/** Local fake transport: prove CLI safety even if cancellation fails and the API allows unsafe deletion. */
async function runCleanup(apply: boolean) {
  const writes: string[] = []
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname
    const method = request.method!
    const attrs = { remark: { th: 'E2E-CLI' }, po_id: 'po', status: 'SUBMITTED' }
    response.setHeader('Content-Type', 'application/json')
    if (path.endsWith('/login')) {
      response.end(JSON.stringify({ access_token: 'local-stub' }))
      return
    }
    if (method !== 'GET') {
      writes.push(`${method} ${path}`)
      response.statusCode = path.endsWith('/cancel') ? 409 : 204
      response.end()
      return
    }
    let data: { id: string; attributes: object }[] = []
    if (path.endsWith('/goods-receipts')) data = [{ id: 'gr', attributes: attrs }]
    if (path.endsWith('/purchase-orders'))
      data = [{ id: 'po', attributes: { remark: attrs.remark, status: 'RECEIVED', items: [{ received_qty: 1 }] } }]
    if (path.endsWith('/products')) data = [{ id: 'product', attributes: { sku: 'E2E-PRODUCT', type: 'single' } }]
    if (path.endsWith('/stock-balances')) data = [{ id: 'balance', attributes: { total_qty: 1 } }]
    response.end(JSON.stringify({ data }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Local stub has no port')
  try {
    try {
      await promisify(execFile)(process.execPath, ['scripts/cleanup-e2e-data.ts', ...(apply ? ['--apply'] : [])], {
        env: {
          BASE_URL: `http://127.0.0.1:${address.port}`,
          E2E_USERNAME: 'E2E-local-stub',
          E2E_PASSWORD: 'local-stub-only',
        },
      })
      throw new Error('Unsafe cleanup unexpectedly succeeded')
    } catch (error) {
      const result = error as { code: number; stdout: string; stderr: string }
      return { ...result, writes }
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

test.describe('Cleanup CLI safety', { tag: ['@purchasing', '@api', '@regression'] }, () => {
  test('failed GR cancellation never deletes a product with stock; exits nonzero', async () => {
    const result = await runCleanup(true)
    expect(result.code).toBe(1)
    expect(result.writes).toContain('POST /api/inventory-bc/v1/goods-receipts/gr/cancel')
    expect(result.writes).not.toContain('DELETE /api/inventory-bc/v1/products/product')
    expect(result.stderr).toContain('stock nonzero or unreadable; refusing deletion')
  })

  test('dry-run defers dependent PO without assuming reversal; purchasing log has no linked SO', async () => {
    const result = await runCleanup(false)
    expect(result.code).toBe(1)
    expect(result.writes).toEqual([])
    expect(result.stdout).toContain('deferred: E2E-CLI (po); reassess PO state after linked GR cancellation succeeds')
    expect(result.stdout).not.toContain('linked SO')
  })
})

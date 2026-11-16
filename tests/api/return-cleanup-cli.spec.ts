import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, test } from '@fixtures/test'

/** Exercise the actual CLI against an isolated return→source dependency graph, including a blocked branch. */
async function run(blockReturn = false) {
  const writes: string[] = []
  const stock = { sale: 1, buy: 3 }
  const state: Record<string, string> = {
    issue: 'SUBMITTED',
    srn: 'SUBMITTED',
    dn: 'SUBMITTED',
    prn: 'SUBMITTED',
    'gr-sale': 'SUBMITTED',
    'gr-buy': 'SUBMITTED',
    'po-sale': 'RECEIVED',
    'po-buy': 'RECEIVED',
  }
  const definitions: Record<string, string[]> = {
    'stock-entries': ['issue'],
    'stock-adjustments': [],
    'sales-returns': ['srn'],
    'delivery-notes': ['dn'],
    'purchase-returns': ['prn'],
    'goods-receipts': ['gr-sale', 'gr-buy'],
    'purchase-orders': ['po-sale', 'po-buy'],
  }
  const attributes = (id: string) => ({
    status: state[id],
    remark: { th: `E2E-CLI-${id}` },
    return_reason: `E2E-CLI-${id}`,
    po_id: id.replace('gr-', 'po-'),
    items: [{ received_qty: state[id] === 'RECEIVED' ? 4 : 0, returned_qty: 0 }],
    created_at: '2026-01-01T01:00:00Z',
  })
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost')
    const path = url.pathname
    response.setHeader('Content-Type', 'application/json')
    const send = (data: unknown) => response.end(JSON.stringify({ data }))
    if (path.endsWith('/login')) {
      response.end(JSON.stringify({ access_token: 'local-stub' }))
      return
    }
    const segments = path.split('/')
    const id = segments.at(-2)!
    if (request.method !== 'GET') {
      writes.push(`${request.method} ${path}`)
      let allowed = true
      if (path.endsWith('/cancel')) {
        if (id === 'issue') stock.sale++
        else if (id === 'srn') {
          allowed = !blockReturn && stock.sale === 2
          if (allowed) stock.sale -= 2
        } else if (id === 'dn') {
          allowed = state.srn === 'CANCELLED'
          if (allowed) stock.sale += 4
        } else if (id === 'prn') stock.buy++
        else if (id === 'gr-sale') {
          allowed = state.dn === 'CANCELLED' && stock.sale === 4
          if (allowed) {
            stock.sale = 0
            state['po-sale'] = 'SENT'
          }
        } else if (id === 'gr-buy') {
          allowed = state.prn === 'CANCELLED' && stock.buy === 4
          if (allowed) {
            stock.buy = 0
            state['po-buy'] = 'SENT'
          }
        }
        if (allowed) state[id] = 'CANCELLED'
      }
      response.statusCode = allowed ? 204 : 409
      response.end()
      return
    }
    if (path.endsWith('/stock-balances')) {
      const key = url.searchParams.get('product_id') === 'product-buy' ? 'buy' : 'sale'
      send([{ id: 'balance', attributes: { total_qty: stock[key] } }])
      return
    }
    if (path.endsWith('/products')) {
      send([
        { id: 'product-sale', attributes: { sku: 'E2E-CLI-SALE' } },
        { id: 'product-buy', attributes: { sku: 'E2E-CLI-BUY' } },
      ])
      return
    }
    const last = segments.at(-1)!
    if (state[last]) {
      send({ id: last, attributes: attributes(last) })
      return
    }
    send((definitions[last] ?? []).map((id) => ({ id, attributes: attributes(id) })))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Local stub has no port')
  try {
    try {
      const result = await promisify(execFile)(process.execPath, ['scripts/cleanup-e2e-data.ts', '--apply'], {
        timeout: 25_000,
        env: { BASE_URL: `http://127.0.0.1:${address.port}`, E2E_USERNAME: 'local-stub', E2E_PASSWORD: 'local-stub' },
      })
      return { code: 0, ...result, writes }
    } catch (error) {
      return { ...(error as { code: number; stdout: string; stderr: string }), writes }
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

test.describe('Return cleanup CLI dependencies (localhost only)', { tag: ['@returns', '@api', '@regression'] }, () => {
  test('undo consumer issue → SRN → DN and PRN → GR before deleting owned masters', async () => {
    const result = await run()
    expect(result.code).toBe(0)
    const index = (path: string) => result.writes.indexOf(`POST /api/${path}`)
    expect(index('inventory-bc/v1/stock-entries/issue/cancel')).toBeLessThan(
      index('sales-bc/v1/sales-returns/srn/cancel'),
    )
    expect(index('sales-bc/v1/sales-returns/srn/cancel')).toBeLessThan(index('sales-bc/v1/delivery-notes/dn/cancel'))
    expect(index('sales-bc/v1/delivery-notes/dn/cancel')).toBeLessThan(
      index('inventory-bc/v1/goods-receipts/gr-sale/cancel'),
    )
    expect(index('inventory-bc/v1/purchase-returns/prn/cancel')).toBeLessThan(
      index('inventory-bc/v1/goods-receipts/gr-buy/cancel'),
    )
    expect(result.writes).toContain('DELETE /api/inventory-bc/v1/products/product-sale')
    expect(result.writes).toContain('DELETE /api/inventory-bc/v1/products/product-buy')
  })

  test('blocked SRN leaves its product while independent PRN/GR cleanup continues', async () => {
    const result = await run(true)
    expect(result.code).toBe(1)
    expect(result.writes).not.toContain('DELETE /api/inventory-bc/v1/products/product-sale')
    expect(result.writes).toContain('DELETE /api/inventory-bc/v1/products/product-buy')
    expect(result.stderr).toContain('stock nonzero or unreadable; refusing deletion')
  })
})

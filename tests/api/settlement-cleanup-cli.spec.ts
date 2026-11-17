import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, test } from '@fixtures/test'
async function run(apply: boolean, blockRefund = false) {
  const writes: string[] = []
  const reads: string[] = []
  const docs = [
    {
      id: 'receipt',
      resource: 'receipts',
      status: 'ISSUED',
      document_type: 'INVOICE',
      remark: { th: 'E2E-CLI [E2E-SCHEDULE]' },
    },
    {
      id: 'bill',
      resource: 'ap-invoices',
      status: 'SUBMITTED',
      document_type: 'VENDOR_BILL',
      remark: { th: 'E2E-CLI' },
    },
    ...[
      'customer-refunds',
      'supplier-refunds',
      'credit-applications',
      'supplier-credit-applications',
      'payment-entries',
      'billing-notes',
    ].map((resource) => ({
      id: resource,
      resource,
      status: resource === 'billing-notes' ? 'ISSUED' : 'SUBMITTED',
      remark: { th: 'E2E-CLI' },
    })),
    { id: 'foreign', resource: 'receipts', status: 'ISSUED', remark: { th: 'REAL [E2E-SCHEDULE]' } },
  ]
  let schedules = [{ id: 'schedule', attributes: { receipt_id: 'receipt', amount: 10 } }]
  const server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://localhost').pathname
    if (req.method === 'GET') reads.push(path)
    res.setHeader('Content-Type', 'application/json')
    const send = (data: unknown) => res.end(JSON.stringify({ data }))
    if (path.endsWith('/login')) {
      res.end(JSON.stringify({ access_token: 'local-stub' }))
      return
    }
    if (req.method !== 'GET') {
      writes.push(`${req.method} ${path}`)
      const doc = docs.find((d) => path.includes(`/${d.resource}/${d.id}`))
      if (!doc || doc.id === 'foreign') {
        res.statusCode = 500
        res.end()
        return
      }
      if (blockRefund && doc.resource === 'customer-refunds') {
        res.statusCode = 409
        res.end()
        return
      }
      if (path.endsWith('/receipt/payment-schedules')) {
        schedules = []
        res.statusCode = 204
        res.end()
        return
      }
      const active = (resource: string) => docs.some((d) => d.resource === resource && d.status !== 'CANCELLED')
      if (
        (doc.resource === 'payment-entries' && active('customer-refunds')) ||
        (doc.id === 'receipt' && schedules.length > 0)
      ) {
        res.statusCode = 409
        res.end()
        return
      }
      doc.status = req.method === 'DELETE' ? 'DELETED' : doc.resource === 'receipts' ? 'VOID' : 'CANCELLED'
      res.statusCode = 204
      res.end()
      return
    }
    if (path.endsWith('/receipt/payment-schedules')) {
      send(schedules)
      return
    }
    const resource = path.split('/').at(-1)
    send(
      docs.filter((d) => d.resource === resource && d.status !== 'DELETED').map((d) => ({ id: d.id, attributes: d })),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing localhost port')
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
      return { code: 0, writes, reads, ...result }
    } catch (error) {
      return { writes, reads, ...(error as { code: number; stdout: string; stderr: string }) }
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

test.describe('Settlement cleanup graph (localhost only)', { tag: ['@finance', '@api', '@regression'] }, () => {
  test('dry-run reports active owned schedules without writes or reading foreign children', async () => {
    const result = await run(false)
    expect(result.code).toBe(1)
    expect(result.writes).toEqual([])
    expect(result.reads.filter((p) => p.endsWith('/payment-schedules'))).toEqual([
      '/api/finance-bc/v1/receipts/receipt/payment-schedules',
    ])
    expect(result.stdout).toContain('1 active owned child record(s)')
  })

  test('refunds → applications → payments → billing → schedules → invoices; foreign documents untouched', async () => {
    const result = await run(true)
    expect(result.code).toBe(0)
    expect(result.writes).toEqual([
      ...[
        'customer-refunds',
        'supplier-refunds',
        'credit-applications',
        'supplier-credit-applications',
        'payment-entries',
        'billing-notes',
      ].map((r) => `POST /api/finance-bc/v1/${r}/${r}/cancel`),
      'DELETE /api/finance-bc/v1/receipts/receipt/payment-schedules',
      'POST /api/finance-bc/v1/receipts/receipt/void',
      'POST /api/finance-bc/v1/ap-invoices/bill/cancel',
    ])
  })

  test('blocked refund/source emits nonzero exit but still attempts independent supplier cleanup', async () => {
    const result = await run(true, true)
    expect(result.code).toBe(1)
    expect(result.writes).toContain('POST /api/finance-bc/v1/supplier-refunds/supplier-refunds/cancel')
    expect(result.writes).toContain('POST /api/finance-bc/v1/ap-invoices/bill/cancel')
    expect(result.writes.some((p) => p.includes('foreign'))).toBe(false)
  })
})

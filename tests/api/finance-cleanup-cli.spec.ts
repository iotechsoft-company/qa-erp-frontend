import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, test } from '@fixtures/test'
async function run(apply: boolean, retainedReturns = false) {
  const writes: string[] = []
  const docs = [
    {
      id: 'invoice',
      resource: 'receipts',
      status: 'ISSUED',
      document_type: 'FULL_TAX_INVOICE',
      remark: { th: 'E2E-CLI-INVOICE' },
    },
    {
      id: 'cn',
      resource: 'receipts',
      status: 'ISSUED',
      document_type: 'CREDIT_NOTE',
      reference_receipt_id: 'invoice',
      remark: { th: 'E2E-CLI-CN' },
    },
    {
      id: 'dn',
      resource: 'receipts',
      status: 'DRAFT',
      document_type: 'DEBIT_NOTE',
      reference_receipt_id: 'invoice',
      remark: { th: 'E2E-CLI-DN' },
    },
    { id: 'void', resource: 'receipts', status: 'VOID', document_type: 'INVOICE', remark: { th: 'E2E-CLI-VOID' } },
    {
      id: 'foreign',
      resource: 'receipts',
      status: 'ISSUED',
      document_type: 'INVOICE',
      remark: { th: 'REAL DOCUMENT' },
    },
    {
      id: 'bill',
      resource: 'ap-invoices',
      status: 'SUBMITTED',
      document_type: 'VENDOR_BILL',
      remark: { th: 'E2E-CLI-BILL' },
    },
    {
      id: 'credit',
      resource: 'ap-invoices',
      status: 'SUBMITTED',
      document_type: 'CREDIT_NOTE',
      reference_ap_invoice_id: 'bill',
      remark: { th: 'E2E-CLI-CREDIT' },
    },
  ]
  const server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://localhost').pathname
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
      if (
        (doc.id === 'invoice' &&
          docs.some((d) => d.reference_receipt_id === 'invoice' && ['DRAFT', 'ISSUED'].includes(d.status))) ||
        (doc.id === 'bill' && docs.some((d) => d.reference_ap_invoice_id === 'bill' && d.status === 'SUBMITTED'))
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
    if (retainedReturns && path.endsWith('/purchase-returns')) {
      send([
        { id: 'stuck-prn', attributes: { return_reason: 'E2E-STUCK-PRN', status: 'REJECTED', grn_id: 'owned-gr' } },
      ])
      return
    }
    if (retainedReturns && path.endsWith('/sales-returns')) {
      send([{ id: 'stuck-srn', attributes: { return_reason: 'E2E-STUCK-SRN', status: 'REJECTED', dn_id: 'owned-dn' } }])
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
      return { code: 0, writes, ...result }
    } catch (error) {
      return { writes, ...(error as { code: number; stdout: string; stderr: string }) }
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

test.describe('Finance cleanup CLI safety (localhost only)', { tag: ['@finance', '@api', '@regression'] }, () => {
  test('dry-run never voids, cancels or deletes and VOID audits are retained', async () => {
    const result = await run(false)
    expect(result.code).toBe(0)
    expect(result.writes).toEqual([])
    expect(result.stdout).toContain('1 void audit record(s) retained; 0 non-cancellable')
  })

  test('child adjustments reverse before parent regardless of API order; foreign records and audits untouched', async () => {
    const result = await run(true)
    expect(result.code).toBe(0)
    expect(result.writes).toEqual([
      'POST /api/finance-bc/v1/receipts/cn/void',
      'DELETE /api/finance-bc/v1/receipts/dn',
      'POST /api/finance-bc/v1/receipts/invoice/void',
      'POST /api/finance-bc/v1/ap-invoices/credit/cancel',
      'POST /api/finance-bc/v1/ap-invoices/bill/cancel',
    ])
  })

  test('PR #11 nit: retained returns identify the original GR/DN instead of a linked SO', async () => {
    const result = await run(false, true)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('E2E-STUCK-PRN (REJECTED, linked GR: owned-gr)')
    expect(result.stdout).toContain('E2E-STUCK-SRN (REJECTED, linked DN: owned-dn)')
  })
})

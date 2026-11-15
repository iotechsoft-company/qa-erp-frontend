import { createServer, type ServerResponse } from 'node:http'

/** Isolated local POM transport tests. No real ERP requests or request rewriting. */
export async function fakeSalesCreate(mode: 'qt-reject' | 'pending-approval' | 'missing-number') {
  let approveResponse: ServerResponse | undefined
  let notifyApprove!: () => void
  const approveRequested = new Promise<void>((resolve) => {
    notifyApprove = resolve
  })
  const calls: string[] = []
  const document = (number: string, status: string) => ({
    data: { id: 'local-so', attributes: { so_number: number, status } },
  })
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname
    if (request.method === 'POST') calls.push(path)
    if (request.method === 'GET') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.end(`<!doctype html><button onclick="save('order')">บันทึกใบสั่งขาย</button><button onclick="save('quotation')">บันทึกใบเสนอราคา</button>
      <div role="dialog" aria-label="พักการขาย">SO-LOCAL</div>
      <script>
      async function post(path) { return fetch('/api/sales-bc/v1/' + path, {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}) }
      async function save(kind) {
        const qt = await post('quotations'); if (!qt.ok) return;
        if (kind === 'order') {
          await post('quotations/local-qt/send'); await post('quotations/local-qt/approve');
          await post('quotations/local-qt/convert-to-sales-order');
          await post('sales-orders/local-so/approve');
        }
        const modal = document.createElement('div'); modal.setAttribute('role','dialog');
        modal.innerHTML = '<h3>ทำรายการขายสำเร็จ</h3>'; modal.append(document.createTextNode(kind === 'order' ? 'SO-LOCAL' : 'QT-LOCAL')); document.body.append(modal);
      }
      </script>`)
      return
    }
    response.setHeader('Content-Type', 'application/json')
    response.statusCode = 201
    if (path.endsWith('/quotations')) {
      if (mode === 'qt-reject') {
        response.statusCode = 400
        response.end(JSON.stringify({ errors: [{ code: 'BAD_REQUEST' }] }))
        return
      }
      response.end(
        JSON.stringify({
          data: {
            id: 'local-qt',
            attributes: mode === 'missing-number' ? {} : { quotation_number: 'QT-LOCAL', status: 'DRAFT' },
          },
        }),
      )
    } else if (path.endsWith('/convert-to-sales-order'))
      response.end(JSON.stringify(document('SO-LOCAL', 'PENDING_APPROVAL')))
    else if (path.endsWith('/sales-orders/local-so/approve')) {
      approveResponse = response
      notifyApprove()
    } else response.end(JSON.stringify({ data: { attributes: {} } }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Local fixture has no port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    approveRequested,
    releaseApprove() {
      approveResponse?.end(JSON.stringify(document('SO-LOCAL', 'CONFIRMED')))
    },
    async close() {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    },
  }
}

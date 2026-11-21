import { expect, test } from '@fixtures/test'

type Candidate = { id: string; attributes: { sku: string; type: string; has_variants: boolean } }
function candidatePath(page: number) {
  const query = new URLSearchParams({
    page: String(page),
    limit: '100',
    relations: 'stock_uom,item_prices,item_prices.price_list',
  })
  query.append('filter', 'type||$eq||single')
  query.append('filter', 'has_variants||$eq||false')
  return `/inventory-bc/v1/products?${query}`
}

// qa-e2e key=fe:/product-groups:component-candidates-first100
// Read-only: open the form, never save or change catalogue/stock records.
test(
  'known frontend#44: bundle component lookup omits valid SKUs beyond its first 100 candidates',
  {
    tag: ['@inventory', '@regression'],
    annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-frontend/issues/44' },
  },
  async ({ api, page, productGroupsPage }) => {
    const next = await api.get<{ data: Candidate[] }>(candidatePath(2))
    const outside = [...next.data]
      .reverse()
      .find(
        (row) =>
          row.attributes.type === 'single' &&
          !row.attributes.has_variants &&
          row.attributes.sku &&
          !row.attributes.sku.startsWith('E2E-'),
      )
    // eslint-disable-next-line playwright/no-skipped-test -- Explicit data precondition; never seed shared catalogue just to exceed the UI window.
    test.skip(!outside, 'Requires a stable non-E2E single product beyond the first 100; no shared data is seeded')
    const valid = outside!
    const detail = await api.get<{ data: Candidate }>(`/inventory-bc/v1/products/${valid.id}`)
    expect(detail.data.attributes).toMatchObject({ sku: valid.attributes.sku, type: 'single', has_variants: false })
    const loaded = page.waitForResponse((res) => {
      const url = new URL(res.url())
      return (
        url.pathname === '/api/inventory-bc/v1/products' &&
        res.request().method() === 'GET' &&
        url.searchParams.get('limit') === '100' &&
        url.searchParams.getAll('filter').includes('type||$eq||single')
      )
    })
    await productGroupsPage.goto()
    const response = await loaded
    expect(response.ok()).toBe(true)
    const initial = (await response.json()) as { data: Candidate[]; meta: { pagination: { total: number } } }
    expect(initial.data).toHaveLength(100)
    expect(initial.meta.pagination.total).toBeGreaterThan(100)
    expect(initial.data.map((row) => row.id)).not.toContain(valid.id)
    await productGroupsPage.openCreate()
    await page.getByPlaceholder('เลือกหรือค้นหาสินค้าเดี่ยวเพื่อเพิ่มเข้าชุด...', { exact: true }).fill(valid.attributes.sku)
    await expect(page.getByRole('option').filter({ hasText: `[${valid.attributes.sku}]` })).toHaveCount(0)
    await expect(page.getByText('No options', { exact: true })).toBeVisible()
  },
)

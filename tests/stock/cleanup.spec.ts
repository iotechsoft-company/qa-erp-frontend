import { StockScenario } from '@api/stock-scenario'
import { expect, test } from '@fixtures/test'

test(
  'Stock cleanup reverses effective approval order across D1/D2 before deleting owned masters',
  { tag: ['@stock', '@api', '@inventory', '@regression', '@mutation'] },
  async ({ allowMutation, api }) => {
    void allowMutation
    const s = new StockScenario(api)
    const documents: { resource: 'stock-entries' | 'stock-adjustments'; id: string }[] = []
    try {
      await s.seed()
      const settings = await api.get<{ data: { attributes: { adjustment_approval_threshold: number } } }>(
        '/inventory-bc/v1/stock-settings',
      )
      expect(settings.data.attributes.adjustment_approval_threshold).toBeGreaterThan(0)
      const receipt = await s.receipt()
      documents.push({ resource: 'stock-entries', id: receipt.id })
      const count = await s.createAdjustment(
        receipt.items[0]!.target_lot_id!,
        11 + settings.data.attributes.adjustment_approval_threshold,
      )
      documents.push({ resource: 'stock-adjustments', id: count.id })
      expect((await s.action('stock-adjustments', count.id, 'submit')).status).toBe('PENDING_APPROVAL')
      const issue = await s.createEntry(s.issueInput())
      documents.push({ resource: 'stock-entries', id: issue.id })
      await s.action('stock-entries', issue.id, 'submit')
      await s.action('stock-adjustments', count.id, 'approve')
      // No manual reversal: finally must undo approval, then issue, then the initial receipt.
    } finally {
      await s.cleanup()
    }
    for (const document of documents) expect((await s.read(document.resource, document.id)).status).toBe('CANCELLED')
    expect(await s.inventory.stockQty(s.productId)).toBe(0)
    expect(await s.inventory.stockQty(s.secondProductId)).toBe(0)
    expect(await api.list('/inventory-bc/v1/products', { filter: `id||$eq||${s.productId}` })).toEqual([])
    expect(await api.list('/inventory-bc/v1/products', { filter: `id||$eq||${s.secondProductId}` })).toEqual([])
  },
)

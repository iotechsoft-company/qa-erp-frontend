import { type ApiClient } from '@api/api-client'
import { buildItemGroup } from '@data/factories'

export const inventoryPath = '/inventory-bc/v1'

/** Covers partial UI success too: find by the exact owned key, even when the UI assertion failed. */
export async function cleanupOwned(api: ApiClient, resource: string, field: string, value: string) {
  if (!value.startsWith('E2E-')) throw new Error('Refusing cleanup of non-E2E data')
  const path = `${inventoryPath}/${resource}`
  const rows = await api.list<Record<string, unknown>>(path, {
    filter: `${field}||$eq||${value}`,
    ignore_limit: 'true',
  })
  for (const row of rows) {
    const actual = field === 'name_th' ? (row.name as { th?: string } | undefined)?.th : row[field]
    if (actual === value) await api.delete(`${path}/${row.id}`)
  }
}

export async function withInventoryReferences(
  api: ApiClient,
  run: (refs: { item_group_id: string; stock_uom_id: string; itemGroup: string; uom: string }) => Promise<void>,
) {
  const group = buildItemGroup()
  // UI only loads the first 100 UOMs. Resolve an existing immutable reference from that same window.
  const uoms = await api.list<{ name: { th: string } }>('/inventory-bc/v1/uoms', { limit: 100 })
  const uom = uoms.find((item) => item.name.th && !item.name.th.startsWith('E2E-'))
  if (!uom) throw new Error('No stock UOM is available in the UI reference window')
  try {
    const createdGroup = await api.create(`${inventoryPath}/item-groups`, group)
    await run({
      item_group_id: createdGroup.id,
      stock_uom_id: uom.id,
      itemGroup: group.name_th,
      uom: uom.name.th,
    })
  } finally {
    // Product cleanup in the callback finishes before deleting its leaf group.
    await cleanupOwned(api, 'item-groups', 'name_th', group.name_th)
  }
}

import { buildItemGroup } from '@data/factories'
import { expect, test } from '@fixtures/test'
import { cleanupOwned } from '../inventory/support'

test('item-group concurrent writes preserve names', { tag: ['@mutation', '@api', '@inventory'] }, async ({ allowMutation, api }) => {
  void allowMutation
  const groups = Array.from({ length: 12 }, () => buildItemGroup())
  const path = '/inventory-bc/v1/item-groups'
  try {
    const first = await api.create(path, groups[0]!)
    await expect(async () => { await api.get(`${path}/${first.id}`) }).toPass({ timeout: 10_000 })
    await Promise.all([
      api.put(`${path}/${first.id}`, { ...groups[0]!, name_en: 'Office stationery revised' }),
      ...groups.slice(1).map((group) => api.create(path, group)),
    ])
    const actual = await api.get<{ data: { attributes: { name: { en: string } } } }>(`${path}/${first.id}`)
    expect(actual.data.attributes.name.en).toBe('Office stationery revised')
  } finally {
    for (const group of groups) await cleanupOwned(api, 'item-groups', 'name_th', group.name_th)
  }
})

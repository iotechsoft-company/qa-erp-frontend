import { buildItemGroup } from '@data/factories'
import { expect, test } from '@fixtures/test'

import { cleanupOwned } from '../inventory/support'

test.describe(
  'Item-group optional parent contract',
  { tag: ['@regression', '@mutation', '@api', '@inventory'] },
  () => {
    test(
      'omitted optional parent creates a root leaf group (#13 deployed regression)',
      {
        annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-api/issues/13' },
      },
      async ({ allowMutation, api }) => {
        void allowMutation
        const { parent_item_group_id: _parent, ...input } = buildItemGroup()
        try {
          const response = await api.postResponse('/inventory-bc/v1/item-groups', input)
          expect(response.status()).toBe(201)
          const created = (await response.json()) as { data: { id: string; attributes: unknown } }
          const expected = {
            parent_item_group_id: null,
            is_group: false,
            name: { th: input.name_th, en: input.name_en },
          }
          expect(created.data.attributes).toMatchObject(expected)
          await expect(async () => {
            const detail = await api.get<{ data: { id: string; attributes: unknown } }>(
              `/inventory-bc/v1/item-groups/${created.data.id}`,
            )
            expect(detail.data.id).toBe(created.data.id)
            expect(detail.data.attributes).toMatchObject(expected)
          }).toPass({ timeout: 10_000 })
        } finally {
          await cleanupOwned(api, 'item-groups', 'name_th', input.name_th)
        }
      },
    )
  },
)

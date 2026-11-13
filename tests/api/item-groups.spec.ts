import { buildItemGroup } from '@data/factories'
import { expect, test } from '@fixtures/test'

import { cleanupOwned } from '../inventory/support'

test.describe(
  'Item-group optional parent contract',
  { tag: ['@regression', '@mutation', '@api', '@inventory'] },
  () => {
    test(
      'root group accepts an omitted optional parent',
      {
        annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-api/issues/13' },
      },
      async ({ allowMutation, api }) => {
        void allowMutation
        test.fail(true, 'erp-api#13 — undefined parent is incorrectly validated as an actual parent')
        const { parent_item_group_id: _parent, ...input } = buildItemGroup()
        try {
          const created = await api.create<{ name: { th: string } }>('/inventory-bc/v1/item-groups', input)
          expect(created.name.th).toBe(input.name_th)
        } finally {
          await cleanupOwned(api, 'item-groups', 'name_th', input.name_th)
        }
      },
    )
  },
)

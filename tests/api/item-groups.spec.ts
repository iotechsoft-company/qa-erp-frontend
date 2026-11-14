import { buildItemGroup } from '@data/factories'
import { expect, test } from '@fixtures/test'

import { cleanupOwned } from '../inventory/support'

test.describe(
  'Item-group optional parent contract',
  { tag: ['@regression', '@mutation', '@api', '@inventory'] },
  () => {
    test(
      'known bug #13: omitted optional parent is rejected as a leaf parent',
      {
        annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-api/issues/13' },
      },
      async ({ allowMutation, api }) => {
        void allowMutation
        const { parent_item_group_id: _parent, ...input } = buildItemGroup()
        try {
          const response = await api.postResponse('/inventory-bc/v1/item-groups', input)
          expect(response.status()).toBe(400)
          expect(await response.json()).toMatchObject({
            status: {
              code: 400000,
              message: 'Cannot attach a child item group to a leaf (is_group=false) parent.',
            },
          })
        } finally {
          await cleanupOwned(api, 'item-groups', 'name_th', input.name_th)
        }
      },
    )
  },
)

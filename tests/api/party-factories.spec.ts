import { buildCustomer, buildSupplier } from '@data/factories'
import { isValidThaiTaxId } from '@data/factories/thai'
import { expect, test } from '@fixtures/test'

import { cleanupParty } from '../helpers/party-suite'

const contracts = [
  {
    kind: 'customer',
    tag: 'customer',
    endpoint: '/sales-bc/v1/customers',
    typeField: 'customer_type',
    factory: () => buildCustomer({ customer_type: 'individual' }),
  },
  {
    kind: 'supplier',
    tag: 'purchasing',
    endpoint: '/supplier-bc/v1/suppliers',
    typeField: 'supplier_type',
    factory: () => buildSupplier({ supplier_type: 'individual' }),
  },
] as const

test.describe('Individual party factories ↔ API', { tag: ['@regression', '@mutation', '@api'] }, () => {
  for (const contract of contracts) {
    test(`${contract.kind} individual`, { tag: `@${contract.tag}` }, async ({ allowMutation, api }) => {
      void allowMutation
      const input = contract.factory()
      expect(isValidThaiTaxId(input.tax_id)).toBe(true)
      try {
        const created = await api.create<{ code: string; name: { th: string } }>(contract.endpoint, input)
        expect(created).toMatchObject({
          code: input.code,
          name: { th: input.name_th },
          [contract.typeField]: 'individual',
          is_vat_registered: false,
        })
        const fetched = await api.get<{ data: { attributes: Record<string, unknown> } }>(
          `${contract.endpoint}/${created.id}`,
        )
        expect(fetched.data.attributes).toMatchObject({
          tax_id: input.tax_id,
          [contract.typeField]: 'individual',
          name: { th: input.name_th },
        })
      } finally {
        await cleanupParty(api, contract.endpoint, input.code)
      }
    })
  }
})

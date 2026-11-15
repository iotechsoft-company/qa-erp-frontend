import { type ApiClient } from '@api/api-client'
import { SalesScenario, type SalesStockSource } from '@api/sales-scenario'
import { expect, test } from '@fixtures/test'
import { expectOverReceipt, stableReadFields } from '../purchasing/receiving-support'
import { type APIResponse } from '@playwright/test'

function rejectingReads(api: ApiClient, error: Error) {
  return new Proxy(api, {
    get(target, key) {
      return key === 'list'
        ? async () => {
            throw error
          }
        : Reflect.get(target, key)
    },
  })
}

test(
  'Sales cleanup preserves both document and stock cleanup failures',
  { tag: ['@sales', '@api', '@regression'] },
  async ({ api }) => {
    const salesError = new Error('document cleanup failed')
    const stockError = new Error('stock cleanup failed')
    let stockAttempts = 0
    const failedApi = rejectingReads(api, salesError)
    const source: SalesStockSource = {
      seed: async () => {
        throw new Error('not used')
      },
      cleanup: async () => {
        stockAttempts += 1
        throw stockError
      },
    }
    const scenario = new SalesScenario(failedApi, source)
    const result: unknown = await scenario.cleanup().catch((error) => error)
    expect(result).toBeInstanceOf(AggregateError)
    expect((result as AggregateError).errors).toEqual(expect.arrayContaining([salesError, stockError]))
    expect(stockAttempts).toBe(1)
  },
)

test(
  'business snapshots ignore nested read metadata but retain changed quantity/identity',
  { tag: ['@purchasing', '@api', '@regression'] },
  () => {
    const first = {
      id: 'owned',
      updated_at: 'before',
      version: 1,
      items: [{ id: 'line', qty: 5, updated_at: 'before' }],
    }
    const read = { id: 'owned', updated_at: 'after', version: 2, items: [{ id: 'line', qty: 5, updated_at: 'after' }] }
    expect(stableReadFields(read)).toEqual(stableReadFields(first))
    expect(stableReadFields({ ...read, items: [{ id: 'other-line', qty: 4 }] })).not.toEqual(stableReadFields(first))
  },
)

for (const allowance of [7, '10.00'] as const) {
  test(
    `over-receipt domain assertion tolerates numeric representation: ${allowance}`,
    { tag: ['@purchasing', '@api', '@regression'] },
    async () => {
      const allowed = 5 * (1 + Number(allowance) / 100)
      const detail = `Receiving 5 of product 'owned-product' would take purchase order item 'owned-line' to 7, exceeding the allowed ${allowed} (qty 5 + ${allowance}% over-receipt allowance).`
      const response = {
        status: () => 409,
        json: async () => ({ status: { code: 409000, message: detail }, errors: [{ code: 'CONFLICT', detail }] }),
      } as APIResponse
      await expectOverReceipt(response, {
        productId: 'owned-product',
        itemId: 'owned-line',
        qty: 5,
        received: 2,
        ordered: 5,
        allowance,
      })
    },
  )
}

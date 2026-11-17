import { ApiClient } from '@api/api-client'
import { SettlementScenario } from '@api/settlement-scenario'
import { expect, test } from '@fixtures/test'

class LaggedCollection extends ApiClient {
  reads = 0
  writes = 0
  override async post<T = unknown>() {
    this.writes++
    return { data: { id: 'owned-payment', attributes: { status: 'SUBMITTED' } } } as T
  }
  override async list<T extends object = Record<string, unknown>>() {
    this.reads++
    return [{ id: 'owned-payment', status: this.reads < 3 ? 'DRAFT' : 'SUBMITTED' }] as unknown as ({
      id: string
    } & T)[]
  }
}

test(
  'settlement observations wait for an acknowledged transition without replaying POST',
  { tag: ['@finance', '@api', '@regression'] },
  async ({ request }) => {
    const api = new LaggedCollection(request)
    const scenario = new SettlementScenario(api)
    await scenario.action('payment-entries', 'owned-payment', 'submit')
    expect((await scenario.records('payment-entries'))[0]!.status).toBe('SUBMITTED')
    expect(api.reads).toBe(3)
    expect(api.writes).toBe(1)
  },
)

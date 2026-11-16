import { ReturnScenario } from '@api/return-scenario'
import { expect, test } from '@fixtures/test'
import { quantities, cogs, ledger } from './support'

test(
  'B4 full return reopens SO at zero net delivery and removes COGS; cancellation restores the delivered sale',
  { tag: ['@returns', '@sales', '@regression', '@mutation'] },
  async ({ allowMutation, api }) => {
    void allowMutation
    const s = new ReturnScenario(api, 'sales')
    try {
      await s.seed()
      const draft = await s.create(4)
      await s.action(draft.id, 'submit')
      await quantities(s, 4, 4, 'CONFIRMED')
      await cogs(s, 0, 0, 4)
      const lot = s.fulfillment!.stock.lots[0]!
      await ledger(s, draft.items[0]!.id, lot.id, 4, 40, 'SALES_RETURN')
      expect((await s.fulfillment!.note(s.source.id)).status).toBe('SUBMITTED')
      await s.action(draft.id, 'cancel')
      await quantities(s, 0, 0, 'CLOSED')
      await cogs(s, 4, 160, 6)
      await ledger(s, draft.items[0]!.id, lot.id, -4, 40, 'SALES_RETURN')
    } finally {
      await s.cleanup()
    }
  },
)

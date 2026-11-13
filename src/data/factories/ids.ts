import { faker } from '@faker-js/faker'
import { E2E_PREFIX } from '@utils/test-data'

const runId = () =>
  `${Date.now().toString(36).toUpperCase()}${faker.string.alphanumeric({ length: 3, casing: 'upper' })}`

export const e2eCode = (entity: string) => `${E2E_PREFIX}-${entity}-${runId()}`

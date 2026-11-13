import { type Response } from '@playwright/test'
import { expect } from '@fixtures/test'

/** Characterize only the open defect. A fix must turn this red so it can become a healthy-flow regression. */
export async function expectQuotationTypeBug(response: Response) {
  expect(response.request().postDataJSON().document_type).toBe('standard_quotation')
  expect(response.status()).toBe(400)
  const body = JSON.stringify(await response.json())
  expect(body).toContain(
    'document_type must be one of the following values: STANDARD_QUOTATION, REVISED_QUOTATION, COST_ESTIMATE, TENDER_QUOTATION',
  )
}

---
name: write-e2e-spec
description: Write a new Playwright E2E spec (and its page objects, factories, cleanup) for an erp-frontend page or flow, following qa-erp-frontend conventions. Use when the user asks to add tests for a page/module/flow — "เขียนเทส", "เพิ่ม test หน้า ...", "cover module ...", "write e2e for ...".
---

# Write an E2E spec for erp-frontend

> Works in Claude Code (`/skill-name`, `.claude/skills/`) and Codex (`$skill-name`, `.agents/skills/` → symlink). Other skills referenced below live next to this one.

Conventions live in `AGENTS.md` — read it first. This skill is the step-by-step that applies them.

## 1. Understand the feature (before any code)

- Page entry: `/Users/PEEPO/Project/nextjs/erp-frontend/apps/web/app/(private)/<route>/page.tsx` → follow the
  imported `@repo/core-*/containers/...` → its `components/`.
- Thai strings you'll locate by: `packages/<core-pkg>/translation/th/*.json` (+ `packages/shared/translation/th/`).
- API the page calls: `packages/<core-pkg>/hooks/` → endpoint → DTO in `.openapi/<prefix>.json`
  (`pnpm fetch:openapi` if missing).
- Business rules / expected behavior: the SRS in `erp-frontend/docs/plan-erp/srs-p*.html` and `core-feature.html`.
- Write down 3–8 scenarios: happy path, validation, permission (staff vs admin), empty state, edge case.

## 2. Discover locators on the live page

Prefer the **Playwright MCP** (`.mcp.json`, starts logged in from `.auth/user.json`; run `pnpm auth` first if missing):
`browser_navigate` → `browser_snapshot` gives the accessibility tree = exactly what `getByRole/getByLabel` see.
Fallback: `pnpm codegen $BASE_URL/<route>` (headed), or the `webapp-testing` skill for a throwaway recon script.

Locator order: `getByRole(name)` → `getByLabel` → `input[name=...]` → `getByTestId`. No MUI classes.
If nothing stable exists, add a row to `docs/TESTID_REQUESTS.md` and use the least-bad locator with a `// TODO(testid)`.

## 3. Page objects

- Reuse shared components in `src/pages/components/` (table, dialog, select, alert...) before writing new ones.
- One class per page in `src/pages/<name>.page.ts`, extends `BasePage`, set `path`, override `waitForReady()`
  to wait for the page's real content (table rows / heading), not a timeout.
- Methods are user intents (`createProduct(input)`, `search(text)`), plus `expect*` helpers for assertions.
- Export from `src/pages/index.ts`; add a fixture in `src/fixtures/test.ts`.

## 4. Test data

- Build data with `@data/factories` (`buildCustomer`, `buildSupplier`, `buildProduct`, ...). Add a new factory
  when needed — match the Create*DTO, realistic Thai values from `thai.ts`, `code`/`sku` prefixed `E2E-`.
- New factory → add a contract test in `tests/api/factories.spec.ts` and the resource to
  `TARGETS` in `scripts/cleanup-e2e-data.ts`.
- Seed prerequisites through `api` (fast), exercise the feature under test through the UI.

## 5. Spec skeleton

```ts
import { buildCustomer } from '@data/factories'
import { expect, test } from '@fixtures/test'

test.describe('Customers', { tag: ['@regression', '@sales'] }, () => {
  test('ค้นหาลูกค้าด้วยรหัส', { tag: '@smoke' }, async ({ customersPage }) => {
    await customersPage.goto()
    // read-only: search existing data, assert with web-first expects
  })

  test('สร้างลูกค้านิติบุคคล', { tag: '@mutation' }, async ({ allowMutation, customersPage, api }) => {
    void allowMutation
    const input = buildCustomer({ customer_type: 'company' })
    let createdId: string | undefined
    try {
      await customersPage.goto()
      createdId = await customersPage.create(input)
      await customersPage.expectRow(input.code)
    } finally {
      if (createdId) await api.delete(`/sales-bc/v1/customers/${createdId}`)
    }
  })
})
```

Tags: `@smoke` (read-only, any env) · `@regression` · `@mutation` (writes) · module tag. Titles may be Thai.
No `waitForTimeout`, no `networkidle`, no `force`. Tests must be independent and parallel-safe.

## 6. Done means

```bash
pnpm check-types && pnpm lint
pnpm exec playwright test <new-spec> --repeat-each=3   # green 3/3
pnpm cleanup:e2e                                       # 0 leftover
```
Then tick the item in `docs/ROADMAP.md`. If a scenario fails because the app is wrong → `report-bug` skill.

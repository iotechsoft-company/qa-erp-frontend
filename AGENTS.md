# AGENTS.md — qa-erp-frontend

E2E test suite for **erp-frontend** (Next.js 16 / React 19 / MUI / next-intl locale `th`).
Source of the app under test: `/Users/PEEPO/Project/nextjs/erp-frontend` (read it to find routes, labels, `name=` attributes).
Target URL comes from `BASE_URL` in `.env`.

## Stack

Playwright Test + TypeScript · pnpm · zod (env validation) · @faker-js/faker · ESLint (eslint-plugin-playwright) · Prettier

## Commands

- `pnpm install && pnpm install:browsers`
- `pnpm test` / `pnpm test:smoke` / `pnpm test:regression` / `pnpm test:ui`
- `pnpm check-types && pnpm lint` — must pass before finishing any task

## Layout

- `src/config/env.ts` — the ONLY place reading `process.env`
- `src/pages/*.page.ts` — Page Objects extending `BasePage`; export from `src/pages/index.ts`
- `src/fixtures/test.ts` — custom `test` with page fixtures + `api` + `allowMutation`. **Always import `test`/`expect` from `@fixtures/test`**, not `@playwright/test`
- `src/api/api-client.ts` — seed/cleanup via same-origin `/api/<bc-prefix>/v1/...` (JSON:API envelope)
- `src/data/factories/` — realistic Thai test data. `thai.ts` = primitives (address w/ real postcodes, valid 13-digit tax id, phone, company, product catalog); `index.ts` = `buildCustomer/buildSupplier/buildProduct` matching Create*DTO
- `tests/api/` — factory ↔ API contract tests (catch DTO drift before UI tests do)
- `src/data/routes.ts` — list of private routes (mirror of `apps/web/app/(private)/**/page.tsx`)
- `tests/setup/` — login once → `.auth/user.json` · `tests/auth/` — runs as guest (no session) · everything else runs logged-in

## Rules

1. Locators: `getByRole` / `getByLabel` first (Thai accessible names from `packages/*/translation/th/*.json` in the ERP repo) → `input[name=...]` → `getByTestId`. Never MUI class names (`.MuiXxx-root`, `.css-xxxx`).
2. No `waitForTimeout`, no `networkidle`, no `force: true`. Use web-first assertions (`await expect(locator).toBeVisible()`).
3. Tags: `@smoke` (read-only, safe on any env) · `@regression` · `@mutation` (writes data) + a module tag (`@inventory`, `@sales`, `@purchasing`, `@auth`, ...).
4. Any test that creates/updates/deletes data must use the `allowMutation` fixture, build data with a factory from `@data/factories` (names realistic, **`code`/`sku` prefixed `E2E-`**), and clean up via `api` (`try/finally` or `afterEach`).
5. Tests are independent — no ordering between tests; seed what you need via `api`.
6. Never commit credentials, `.env`, `.auth/`, or the backend API domain. API calls go through `BASE_URL/api/*` only.
7. Test titles may be Thai; describe blocks name the feature.
8. Never type a wrong password for a real account (backend locks it — `userBlocked`); use a non-existent username.
9. Use `BasePage.alert` for MUI alerts — `getByRole('alert')` also matches Next.js's hidden `#__next-route-announcer__`.

## QA tooling (shared by Claude Code and Codex)
Skills: source of truth is `.claude/skills/<name>/SKILL.md`; `.agents/skills/<name>` are symlinks so Codex discovers the same files.
Invoke: Claude Code `/triage-failure` · Codex `$triage-failure` (both also auto-trigger from the description).
Playwright MCP: Claude Code reads `.mcp.json`, Codex reads `.codex/config.toml` (project must be **trusted** in Codex) — keep them in sync.
Hooks (`scripts/hooks/`, both agents) block risky git/secret/ERP-source actions and enforce tsc+eslint on files you edit before you finish — if a hook blocks you, follow its message; don't work around it.
New skill → create it under `.claude/skills/<name>/`, then `ln -s ../../.claude/skills/<name> .agents/skills/<name>`.

| Need | Use |
|---|---|
| Test failed / CI red | `.claude/skills/triage-failure` → classify flaky / test bug / data-env / app bug |
| Test passes only sometimes | `.claude/skills/flaky-hunter` → measure with `--repeat-each`, deterministic fix |
| New spec for a page/flow | `.claude/skills/write-e2e-spec` → ERP source → locators → POM → factory → spec |
| App bug confirmed | `.claude/skills/report-bug` → GitHub issue in erp-api / erp-frontend |
| Explore a live page / find locators | Playwright MCP (`.mcp.json` / `.codex/config.toml`, starts logged in from `.auth/user.json` — run `pnpm auth` first; passwords from `.env` are masked) |
| Throwaway recon script | `.claude/skills/webapp-testing` (vendored from anthropics/skills @ `2c5958e`, Apache-2.0). Python Playwright, uses `networkidle`/timeouts — **recon only, never copy its patterns into specs** |

## Found an app bug?

Follow `.claude/skills/report-bug/SKILL.md` (Codex: read it as instructions). Summary: triage test-bug vs app-bug →
route to `iotechsoft-company/erp-api` (API status/body/data) or `iotechsoft-company/erp-frontend` (UI) →
dedupe via `qa-e2e key=` marker → redact secrets & API domain → `gh issue create --label bug --label qa-e2e` →
mark the spec with `test.fail()` + `annotation: { type: 'issue', description: <url> }`.

## API gotchas (verified)

- Responses are JSON:API: `{ data: { id, attributes } }`; i18n fields come back as `name: { th, en }` even though create takes `name_th`/`name_en`.
- The `api` fixture uses its own request context (no browser cookies) + sends `x-csrf-token`; reusing the page's `request` fixture → 403 "Missing or invalid CSRF token".
- Products attach only to a **leaf** item group: lookup with `filter: 'is_group||$eq||false'`.
- Creating an IAM user returns `temp_password`; the user must `POST /auth/v1/auth/change-password` before other calls (handled by `provision:users`).

- Inventory `/product-groups` means bundle products (`type=bundle`), not item categories. At least one component is required in its UI form; cleanup must delete the bundle before its component product.
- Inventory pagination is local React state, not URL query state. A visible table can still contain skeleton rows; wait for edit actions or the translated empty state before reading pagination.
- Inventory list columns currently expose no sort controls (`sortable`/`onSort` absent). Do not simulate sorting by clicking plain column text.
- Product forms load only the first 100 UOMs. For UI tests, resolve a read-only UOM from that same window; a newly created UOM is not guaranteed to appear. Item-group/UOM DTOs have no code field: prefix `name_th` with `E2E-` and read response ownership from `name.th` during cleanup.
- Scope normal item-group identity checks to the name column: a group's name may also appear in other rows' parent-name cells. Comparing whole product rows is unstable while price/barcode subqueries hydrate.
- Before UI edit/delete after a search, await the matching list response (including its body), not just visibility of the target row: it may already exist in the previous results while the new query is still in flight. Valid-form submissions also wait for POST/PUT success and the form to close; validation-only submits intentionally await no request.
- MUI drawers/modals temporarily hide the background table from accessibility queries. Wait for its named column header to be visible before reading columns. Empty/loading rows use one colspan cell; exclude them when comparing API rows with rendered columns.
- Cleanup products in dependency order: bundles first, then component singles, then item groups. Otherwise components/groups can return 409. The cleanup script reports a nonzero exit code if any target read/delete fails.
- The dev API has occasionally returned 404 for an item-group detail GET immediately after successful POST. Factory contracts assert the create response immediately and allow up to 10 seconds for the detail read to become visible.

# AGENTS.md — qa-erp-frontend

E2E test suite for **erp-frontend** (Next.js 16 / React 19 / MUI / next-intl locale `th`).
Source of the app under test: `/Users/PEEPO/Project/nextjs/erp-frontend` (read it to find routes, labels, `name=` attributes).
Target URL comes from `BASE_URL` in `.env`.

**Working with another agent:** read `docs/WORKFLOW.md` first — Codex builds on `codex/<module>` branches, Claude reviews/owns platform from its own worktree, everything lands on `main` via PR only.

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

| Need                                | Use                                                                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test failed / CI red                | `.claude/skills/triage-failure` → classify flaky / test bug / data-env / app bug                                                                                                               |
| Test passes only sometimes          | `.claude/skills/flaky-hunter` → measure with `--repeat-each`, deterministic fix                                                                                                                |
| New spec for a page/flow            | `.claude/skills/write-e2e-spec` → ERP source → locators → POM → factory → spec                                                                                                                 |
| App bug confirmed                   | `.claude/skills/report-bug` → GitHub issue in erp-api / erp-frontend                                                                                                                           |
| Explore a live page / find locators | Playwright MCP (`.mcp.json` / `.codex/config.toml`, starts logged in from `.auth/user.json` — run `pnpm auth` first; passwords from `.env` are masked)                                         |
| Throwaway recon script              | `.claude/skills/webapp-testing` (vendored from anthropics/skills @ `2c5958e`, Apache-2.0). Python Playwright, uses `networkidle`/timeouts — **recon only, never copy its patterns into specs** |

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
- `parent_item_group_id` is optional in CreateItemGroupDTO, but omission currently triggers incorrect parent validation on dev (erp-api#13). Factories send explicit null for root groups; the omitted-parent regression characterizes the exact HTTP 400/400000 parent-validation message with an issue annotation; a fix turns that characterization red.
- Mutation tests run in the `chromium-mutation` project with one worker to isolate shared tree rebuilds. Read-only Chromium tests remain parallel; no test relies on another test's data or order.

- `/purchasers` is the supplier master-data UI (Thai labels use “ผู้จัดส่ง”), calling `/supplier-bc/v1/suppliers`; customer master data calls `/sales-bc/v1/customers`.
- Customer/supplier lists use a debounced search plus an explicit search button, local pagination state, and combined Thai/English name cells. Match rows by their unique code; compare pagination against the returned code column rather than the combined name cell.
- Customer credit limit/terms reject negative numbers, but supplier credit terms have no minimum in the current DTO/schema. Supplier country/currency inputs validate lengths and uppercase values when building the request payload; do not infer a 13-digit tax-ID UI validation rule from realistic factory data (the form currently requires 1–20 characters).

- Sales `s` JSON search operators differ from `filter` operators: JSON uses `cont`/`starts`/`ieq` without `$`, while filter uses `field||$cont||value`. Current sales list UI sends unsupported `$contL` (erp-frontend#2); lifecycle specs use real pagination instead of rewriting requests.
- QuotationDocumentType on the backend is uppercase (`STANDARD_QUOTATION`, etc.); current frontend enum is lowercase and blocks QT/SO creation (erp-frontend#3). DN requires real `so_id` and `so_item_id`, never customer/product IDs (erp-frontend#4).
- Only draft QT/DN have API update/delete; their UI controls are missing (erp-frontend#5). SO is conversion-only, has no PUT/DELETE, and is cleaned by cancellation. State changes can reorder list rows across pages; re-find a document after a transition.
- Sales numbers are generated by the server. Prefix factory `remark_th` with a unique `E2E-` marker and check response `remark.th` before cleanup. Cancelled sales documents are immutable audit records, not deletable test leftovers: report retained audits separately from active E2E records. Never claim zero total rows when audits remain.
- Stock-balance responses use `product_sku`, `total_qty`, `expired_qty`, and warehouse IDs. Do not assume the frontend IStockBalance aliases (`sku`/`available_qty`) match the wire response.

- Sales draft PUT can intermittently return 404 after successful POST/GET of the same ID (7/20 measured serial contract runs). Update contracts are quarantined with an erp-api#14 issue annotation; do not retry writes to hide this unresolved behavior.

- Concurrent item-group create/update can return HTTP 500 / PostgreSQL 40P01 deadlock (erp-api#15). Always await allSettled for concurrent mutations before cleanup so one failed request cannot race remaining writes; the intermittent repro remains quarantined.

- Customer/supplier smoke searches choose the first non-E2E code. If none is visible, search an unmatched value and assert the empty state; never depend on a parallel mutation test’s record.
- Sales regressions for frontend#2–#5 characterize the exact open bug (request payload + status/error or confirmed draft controls absent), retaining issue annotations. Do not use broad test.fail for these cases; replace characterization with healthy-flow assertions when fixed.
- Sales cleanup follows backend transition guards: cancel linked SO before re-reading/cancelling QT; retain linked/expired QT and partial/closed/delivered SO. DN supports cancellation only from DRAFT/PENDING_APPROVAL/SUBMITTED (drafts are deleted). Always attempt owned customer cleanup and report aggregated failures.

- Purchasing PO lives at `/supplier-bc/v1/purchase-orders`; GR at `/inventory-bc/v1/goods-receipts`. Both use server-generated numbers and E2E ownership in `remark_th` / response `remark.th`. GR references the actual `po_item_id`, not product ID.
- Stock balances are a report endpoint: use direct `product_id`/`warehouse_id` parameters (not generic filter), default `group_by=product_warehouse`, and `include_zero_qty=true` to verify reversal. GR warehouse must be a stock leaf (`warehouse_type=stock`, `is_group=false`); a leaf of another type is rejected. Some warehouse responses have no code, so UI labels can be just the Thai name.
- `/purchasing/orders` and GR pending tab default to APPROVED/SENT/PARTIAL, excluding DRAFT. Select แบบร่าง explicitly when testing draft PO. Lists search with generic filter and sort by created_at:desc then document number; no interactive sort buttons are rendered.
- Purchase create defaults to GR mode. Its save button is disabled with no items. Validate document date before quantity; GR requires an explicit stock warehouse. Purchase product options contain SKU with other text, so scope the option by its unique owned SKU.
- Purchasing uses owned supplier and product records so receipt/cancellation never changes shared catalogue stock. Submit creates lots and moves stock; cancel reverses GR and synchronizes the PO back to SENT. Assert stock=0 before deleting the owned product. Cleanup order: GR, PO, product, supplier; keep cancelled audit documents and stock history.
- Draft PO/GR edit/delete UI is absent (frontend#6). Submitted GR cancel is also hidden when the linked PO is RECEIVED because modal controls use PO status (frontend#7). Characterize only these exact defects; UI receive tests explicitly label their API cancellation workaround.
- Purchasing partial PUT can also return 404 after POST/GET of the same DRAFT ID (PO 5/10 isolated repeats; GR observed in combined scope). Track under erp-api#14, quarantine only update cases and never retry writes; create/read/delete contracts remain active.

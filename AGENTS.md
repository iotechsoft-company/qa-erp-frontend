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
- `parent_item_group_id` is optional in CreateItemGroupDTO. Dev now accepts omission (verified 2026-11-19: healthy create/read 10/10, root parent=null); the api#13 annotation stays on the healthy regression while the GitHub issue remains open. Explicit null in factories is still valid. Do not retain the obsolete expected-400 characterization after the deployed fix.
- Mutation tests run in the `chromium-mutation` project with one worker to isolate shared tree rebuilds. Read-only Chromium tests remain parallel; no test relies on another test's data or order.

- `/purchasers` is the supplier master-data UI (Thai labels use “ผู้จัดส่ง”), calling `/supplier-bc/v1/suppliers`; customer master data calls `/sales-bc/v1/customers`.
- Customer/supplier lists use a debounced search plus an explicit search button, local pagination state, and combined Thai/English name cells. Match rows by their unique code; compare pagination against the returned code column rather than the combined name cell.
- Customer credit limit/terms reject negative numbers, but supplier credit terms have no minimum in the current DTO/schema. Supplier country/currency inputs validate lengths and uppercase values when building the request payload; do not infer a 13-digit tax-ID UI validation rule from realistic factory data (the form currently requires 1–20 characters).

- Sales `s` JSON search operators differ from `filter` operators: JSON uses `cont`/`starts`/`ieq` without `$`, while filter uses `field||$cont||value`. Current sales list UI sends unsupported `$contL` (erp-frontend#2); lifecycle specs use real pagination instead of rewriting requests.
- QuotationDocumentType on the backend is uppercase (`STANDARD_QUOTATION`, etc.); frontend PR #1 deployed the uppercase enum and QT→send→approve→convert chain for QT/SO/DN creation. Healthy regressions retain frontend#3/#4 annotations and assert real `so_id`/`so_item_id`, never customer/product IDs.
- Only draft QT/DN have API update/delete; their UI controls are missing (erp-frontend#5). SO is conversion-only, has no PUT/DELETE, and is cleaned by cancellation. State changes can reorder list rows across pages; re-find a document after a transition.
- Sales numbers are generated by the server. Prefix factory `remark_th` with a unique `E2E-` marker and check response `remark.th` before cleanup. Cancelled sales documents are immutable audit records, not deletable test leftovers: report retained audits separately from active E2E records. Never claim zero total rows when audits remain.
- Stock-balance responses use `product_sku`, `total_qty`, `expired_qty`, and warehouse IDs. Do not assume the frontend IStockBalance aliases (`sku`/`available_qty`) match the wire response.

- Sales draft PUT can intermittently return 404 after successful POST/GET of the same ID (7/20 measured serial contract runs). Update contracts are quarantined with an erp-api#14 issue annotation; do not retry writes to hide this unresolved behavior.

- Concurrent item-group create/update can return HTTP 500 / PostgreSQL 40P01 deadlock (erp-api#15). Always await allSettled for concurrent mutations before cleanup so one failed request cannot race remaining writes; the intermittent repro remains quarantined.

- Customer/supplier smoke searches choose the first non-E2E code. If none is visible, search an unmatched value and assert the empty state; never depend on a parallel mutation test’s record.
- Sales regressions for frontend#2/#5 characterize the exact open bug; frontend#3/#4 retain their issue annotations on healthy create regressions after the deployed fix. Open-bug checks require the exact signature (request payload + status/error or confirmed draft controls absent), retaining issue annotations. Do not use broad test.fail for these cases; replace characterization with healthy-flow assertions when fixed.
- Sales cleanup follows backend transition guards: cancel linked SO before re-reading/cancelling QT; retain linked/expired QT and partial/closed/delivered SO. DN supports cancellation only from DRAFT/PENDING_APPROVAL/SUBMITTED (drafts are deleted). Always attempt owned customer cleanup and report aggregated failures.

- Purchasing PO lives at `/supplier-bc/v1/purchase-orders`; GR at `/inventory-bc/v1/goods-receipts`. Both use server-generated numbers and E2E ownership in `remark_th` / response `remark.th`. GR references the actual `po_item_id`, not product ID.
- Stock balances are a report endpoint: use direct `product_id`/`warehouse_id` parameters (not generic filter), default `group_by=product_warehouse`, and `include_zero_qty=true` to verify reversal. GR warehouse must be a stock leaf (`warehouse_type=stock`, `is_group=false`); a leaf of another type is rejected. Some warehouse responses have no code, so UI labels can be just the Thai name.
- `/purchasing/orders` and GR pending tab default to APPROVED/SENT/PARTIAL, excluding DRAFT. Select แบบร่าง explicitly when testing draft PO. Lists search with generic filter and sort by created_at:desc then document number; no interactive sort buttons are rendered.
- Purchase create defaults to GR mode. Its save button is disabled with no items. Validate document date before quantity; GR requires an explicit stock warehouse. Purchase product options contain SKU with other text, so scope the option by its unique owned SKU.
- Purchasing uses owned supplier and product records so receipt/cancellation never changes shared catalogue stock. Submit creates lots and moves stock; cancel reverses GR and synchronizes the PO back to SENT. Assert stock=0 before deleting the owned product. Cleanup order: GR, PO, product, supplier; keep cancelled audit documents and stock history.
- Draft PO/GR edit/delete UI is absent (frontend#6). Submitted GR cancel is also hidden when the linked PO is RECEIVED because modal controls use PO status (frontend#7). Characterize only these exact defects; UI receive tests explicitly label their API cancellation workaround.
- Purchasing partial PUT can also return 404 after POST/GET of the same DRAFT ID (PO 5/10 isolated repeats; GR observed in combined scope). Track under erp-api#14, quarantine only update cases and never retry writes; create/read/delete contracts remain active.
- Purchasing cleanup waits (read-only, bounded) for cancelled GRs to synchronize their PO back to SENT and for owned stock to return to zero before deleting the product. The cleanup CLI also refuses deletion when stock is nonzero or unreadable; dry-run defers POs with submitted GRs without assuming reversal will succeed.
- Receive-modal cells must be scoped to one identified product row (SKU for multi-line orders); never flatten cells across all tbody rows. HTML date inputs in tests use `bangkokDate()` so midnight–07:00 Bangkok does not select yesterday's UTC date.
- GR over-receipt is checked at submit, using the current read-only `stock-settings.over_receipt_allowance`; creating the draft alone does not reject excessive qty. Invalid parent PO states return 400/BAD_REQUEST, while repeated GR submit/cancel returns 409/CONFLICT; assert the exact domain message and unchanged stock/PO/lot/ledger.
- GR cancellation preserves the lot's historical `received_qty` but sets `available_qty` to zero. Its stock ledger reversal is an ADJUSTMENT with negative qty/cost value and the same GR source ID; reversal `source_doc_number` can be null. Partial receiving tests explicitly enter the intended qty at each step instead of depending on modal defaults.

- Sales UI create can perform several requests. Wait for the final SO conversion or DN creation plus its success dialog before cleanup; waiting only for the initial QT POST can race a still-running conversion and leave an SO behind. Migrated create tests use owned GR stock and keep the DN DRAFT, asserting stock stays unchanged before cleanup reverses the GR.
- SalesScenario accepts a constructor-injected SalesStockSource; default catalogue references stay read-only, while OwnedSalesStock owns/reverses GR stock. Do not reintroduce a subclass-only seed signature or lose Sales errors when stock cleanup fails; aggregate both.
- Shared Sales success Modal currently has no accessible dialog name; scope getByRole('dialog') by its translated heading with filter({ has: heading }), not by page-wide dialog or assumed aria-label. Observe chain POST failures and wait for the UI completion barrier before cleanup, including any follow-up approval.
- Header purchase discount is in an unnamed inline Card, not a popover/dialog. Its proposed container ID is documented in docs/TESTID_REQUESTS.md; until available, require one unambiguous placeholder match instead of brittle ancestor/MUI selectors.

- Sales confirmation preflights available non-expired stock; a shortage/expired-only case can fail at QT→SO conversion before any DN exists. DN submit also rechecks stock because confirmation does not reserve lots. Credit exposure sums undelivered ex-VAT unit values, rather than the VAT-inclusive SO grand total.
- DN stock-ledger source_doc_id and Finance sale_id/ref_doc_id identify the DN **item**, not its header. Finance ledger ref_doc_type is DELIVERY_LINE; cancellation deletes COGS/profit records and retains original plus reversing GL journals. Re-read the SO after cancelling DNs before cleanup: PARTIAL/CLOSED may return to CONFIRMED.

- Since erp-api PR #17 (BE-08), inventory stock-shortage errors preserve `errors[].code=INSUFFICIENT_STOCK` and `meta={product_id,warehouse_id,requested,available}` across the RPC hop; the envelope remains HTTP 409 / status.code 409000. Assert this structured code rather than the old numeric errors[].code.

- D1/D2 currently have API endpoints but no frontend routes/containers. Stock entries require type-specific shapes: REPACK uses from_warehouse_id only, SOURCE/DESTINATION line roles and server-computed destination cost; transfer uses an actual source_lot_id and two distinct stock leaf warehouses. Do not infer a UI route or copy the older guide table's REPACK header shape over the current DTO.
- Stock adjustments accept counted_qty (never delta); approval threshold uses the sum of absolute per-line value changes. Approval re-reads lots and updates system_qty/qty against their current balance while retaining the original approval-value snapshot.
- erp-api#18: cancelling PENDING_APPROVAL stock adjustment incorrectly runs the submitted-lot guard. Owned cleanup approves then reverses it; the issue regression asserts the exact 409 and unchanged stock. Restore healthy cancellation when fixed. Drafts are deleted, never cancelled.
- Stock cleanup must reverse effective posting order across entries/adjustments, using approved_at before submitted_at/created_at. An adjustment created before an issue may be approved after it and must reverse first. Cancelled records and lot/ledger audit history remain; product deletion requires stock=0.
- Stock entry/adjustment PUT also exhibits api#14 (404 after POST + successful GET); only update cases are quarantined. Initial Sales newOrder/draft GETs and stock read/reversal assertions use bounded read-only polling; never wrap writes in toPass.

- erp-api#14 also has a cross-service PO-state variant: supplier-bc GET already returns SENT while inventory-bc GR create still validates APPROVED and returns HTTP 400 (review measured 1 in ~45 creations; evidence: https://github.com/iotechsoft-company/erp-api/issues/14#issuecomment-6903271277). A successful supplier-side state poll does not prove inventory-side visibility. Classify this as the known stale read; never retry the GR POST or add a delay to hide it.

- PRN/SRN references are original `grn_item_id` / `dn_item_id`, not product IDs. API factories mark `return_reason` and `remark_th`; PRN UI has no remark input, so cleanup discovers owned returns by E2E-prefixed `return_reason` and scenarios also verify the owned source ID.
- PRN cancel restores the original lot using positive `RETURN` movements. SRN credits/debits original lots using `SALES_RETURN` in both directions; source_doc_id is the SRN item ID. Multi-lot return costs follow persisted DN ISSUE order (created_at/id), not fixture receipt insertion order.
- SRN submit/cancel asynchronously changes COGS and GL. Use bounded read-only convergence assertions; cleanup waits for restored COGS before DN cancel, then COGS=0 before finishing. Never retry state-changing writes. Return cleanup precedes DN/GR cancellation and products are deleted only at stock=0.
- Submitted GR return action is hidden by lowercase status comparison (frontend#14); PRN history/details work. B4 has no receive-return UI in current source. PRN/SRN PUT can also exhibit api#14 POST/GET→PUT 404; quarantine only those update contracts.

- A5 AP documents are `/finance-bc/v1/ap-invoices` (`VENDOR_BILL`/`CREDIT_NOTE`); C1/C2 use `/finance-bc/v1/receipts` with document_type, not separate CN/DN endpoints. Current frontend has no finance document pages; keep API-path coverage explicit.
- AP lines reference actual `grn_item_id`, receipts billed from DN require header `delivery_note_id` and actual line `dn_item_id`. AP credit notes require submitted original bill plus actual submitted PRN quantities. Receipt CN/DN require original ISSUED tax invoice + adjustment_reason and inherit its VAT/inclusion.
- Finance wire money is numeric(18,4); backend roundMoney uses 4 decimals. Do not assume 2-decimal UI display precision in VAT/totals/GL contracts. RECEIPT and PROFORMA_INVOICE intentionally post no GL; invoice/tax/CN/DN and AP use existing account roles.
- Financial cleanup reverses/deletes CN/DN before original receipts/AP bills, then unwinds returns/GR/DN/stock. Issued receipts are voided with void_reason, submitted AP documents cancelled with cancel_reason; VOID/CANCELLED documents and reversing GL remain as audits. No finance writes should move physical stock.
- Finance receipt/AP PUT also exhibited api#14: 404 after POST/GET; receipt failed 2/4 attempts, AP failed after nine passes (1/10). Quarantine only those two update contracts; keep create/read/delete and transitions active. No write retry; initial reads are bounded. Evidence: https://github.com/iotechsoft-company/erp-api/issues/14#issuecomment-6919581988 and https://github.com/iotechsoft-company/erp-api/issues/14#issuecomment-6921624573

- Sales all-status pagination includes retained cancelled audits and can make repeated transition lookups depend on historical data volume. Scope actionable DN workflows with the real DRAFT/SUBMITTED status filter before pagination, and wait for filtered response identities to match visible rows before acting. Keep the exact search-bug characterization; never rewrite requests, raise timeouts or retry writes to hide traversal cost.

- Billing/payment updates are PATCH; credit applications/refunds have create/read/delete and submit/cancel but no update route. No current frontend routes/containers exist for C3–C5/C10; keep their API-path coverage explicit.
- Foreign-currency payment inputs still use THB: paid_amount is at the payment rate, allocated_amount at each invoice's book rate; raw_* values are server-derived divisions. Compare raw amounts for settlement limits and assert realised FX account roles. AP price-tolerance guards also apply to FX fixtures; use a cost inside the current read-only tolerance.
- WHT is part of gross allocated debt, not an extra amount on top; invoice wht_config_code must resolve an existing effective tax-config. Payment headers and per-line withholding must agree and cannot exceed the document's remaining total_wht.
- Credit sources are unallocated submitted payments or CN surplus after settling the original invoice. Applications move credit without GL; refunds post/reverse cash and AR/AP. Cancel refunds/applications before source payments, then billing before invoice reversal. Payment numbers are assigned at submit, so use the submitted response in exact guard messages.
- Schedules exist only at /receipts/:id/payment-schedules; they are not an allowed receipt relation or global collection. Their amounts restate the whole invoice, order follows the client's sequence rather than due-date sorting, payments consume the head and CNs reduce the tail. AR aging uses the header due_date, not per-instalment dates.
- Schedule rows have no E2E remark: parent receipts must carry both the unique E2E marker and [E2E-SCHEDULE] before schedule writes. Cleanup CLI checks only those parents (including VOID audits), deletes children before parent reversal and reports nonzero dry-run status for remaining children. Never scan or delete schedules under unmarked receipts.
- Finance cleanup must poll each account's zero net after cancellation/void using bounded read-only reads; overall debit=credit alone is insufficient. Explicit secondary-party cleanup must retain the scenario's ownership marker and run before deleting that owned party. Never retry a write in the convergence poll.

- A Finance settlement collection can briefly report DRAFT after submit has returned SUBMITTED and its aging/GL is already visible. SettlementScenario tracks acknowledged transition statuses and waits for those collection rows before snapshots/cleanup. Poll only those reads (bounded); never capture a stale baseline, replay the POST or turn a rejection into a broad expected failure.

- BE-14 (verified 2026-11-19): DN submit/approve now issues one FULL_TAX_INVOICE automatically; public manual DN-linked create rejects 409/DELIVERY_NOTE_ALREADY_INVOICED even after that invoice is voided. No DTO opt-out exists. Locate the invoice by the actual DN ID and verify is_issued_on_delivery, owned customer/E2E remark and actual DN item refs before any reversal. DN cancellation voids the automatic invoice and reverses stock/COGS/GL/AR; cancelled/VOID audits remain.
- FinanceScenario keeps the automatic invoice only when seed(true, { keepDeliveryInvoice: true }) is requested. Default manual-document fixtures void only their owned automatic invoice and poll per-account GL/owned AR zero before starting standalone receipt tests. receiptInput intentionally has no DN header/item refs; linkedReceiptInput exists for source/duplicate guards. Never silently remove references from a test that claims DN-linked billing or change shared settings to restore the obsolete workflow.

- BE-14 UI submit/approve actions now open confirmation dialogs before POST: submit heading ยืนยันการส่งของ/button ยืนยันส่งของ; approve heading ยืนยันการอนุมัติ/button ยืนยันอนุมัติ. Scope by the translated heading, verify the DN number, then observe the request after confirm. Negative submit guards must confirm too and preserve the actual error response.
- UI prices can include VAT. Read the owned SO is_vat_included/vat_rate snapshot and independently compute net/VAT/total to 4 decimals; profit revenue is ex-VAT, not the gross line_total. With gross150 and VAT7, net revenue is140.1869, not150. Keep cost/GL/reversal checks intact.
- frontend#44: bundle component Autocomplete loads only100 single/non-variant candidates and filters locally. A valid non-E2E SKU from a later API page yields No options (healthy lookup failed3/3 on 2026-11-19). Owned bundle UI CRUD is quarantined with its issue; an exact read-only characterization verifies real detail200, the actual UI window and missing option. It never saves a form or touches shared stock; environments without a stable outside-window candidate record an explicit data gap.

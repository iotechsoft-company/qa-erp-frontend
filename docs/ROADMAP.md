# Roadmap / TODO for next agent

Scaffold status (2026-11-13): config, auth setup, login specs, private-route smoke, products stub.
Verified: full suite green against BASE_URL with superadmin (29 passed, 1 fixme skipped).
Gotchas: Next.js route announcer has `role="alert"` → use `BasePage.alert`, not `getByRole('alert')`.
Never submit a wrong password for a real account (backend locks it — `userBlocked`); use a non-existent username.

Data (2026-11-13): test users `e2e.admin` / `e2e.staff` provisioned on dev; customer/supplier/product factories verified against live API (`tests/api`).

## Phase 1 — Smoke (read-only)

- [x] Fill `.env` credentials, run `pnpm test:smoke`
- [ ] Logout flow (find the user menu in app shell / `@repo/shared` layout)
- [ ] Sidebar navigation: click every menu item → correct URL (replace direct `goto` in smoke)

## Phase 2 — Page Objects per module (source: ERP repo `packages/core-*/containers`)

- [x] Shared components POM: data table (rows/columns, sort API, pagination), search box, inline filter, confirm dialog, snackbar/alert, MUI select/autocomplete. Inventory uses inline filters; no filter drawer is rendered.
- [x] inventory: products, item-groups, product-groups — list + create/edit forms, read-only search/pagination, UI CRUD and Thai required-field validation. Sort UI remains unavailable (see Phase 2 verification).
- [ ] customer: customers · supplier: purchasers — implemented, awaiting PR review/merge: list/search/pagination, create/edit POMs, company + individual UI CRUD, delete cancellation, Thai required/length and module-specific validation.
- [ ] sales: quotations, orders, delivery-notes, create — POMs, draft API create/read/delete (update quarantined), list/filter/pagination, UI QT→SO lifecycle and DN read/cancel validation implemented; full UI CRUD blocked by erp-frontend#2–#5 (see Sales verification).
- [ ] purchasing: orders, goods-receipts, create
- [ ] reports: sales, purchases (filters + export)
- [ ] settings: shop, sales, item-groups

## Phase 3 — Regression / CRUD (`@mutation`, dev)

- [ ] More factories from `.openapi/*.json`: customer-groups, supplier-groups, brands, item-prices, quotations, sales-orders, purchase-orders, goods-receipts
- [x] Extend `scripts/cleanup-e2e-data.ts` TARGETS for new Phase 2 entities: item-groups and uoms (`name_th`, response `name.th`). Extend again when later factories are added.

- [x] Product CRUD and bundle CRUD through UI, with API cleanup
- [ ] Product image upload via presigned flow
- [ ] Sales flow: quotation → order → delivery note
- [ ] Purchase flow: PO → goods receipt → stock balance changes
- [x] Inventory required-field validation errors (Thai), including bundles requiring at least one component
- [ ] Validation errors in other modules

## Phase 4 — Extras

- [ ] Permission tests with `e2e.staff` (`requireStaffCredentials()`, ROLE_STAFF = everything except user management) → hidden buttons / 403. Add a second storageState in setup
- [ ] Visual regression with `toHaveScreenshot` on stable pages
- [ ] Accessibility checks with `@axe-core/playwright`
- [ ] Report: Allure or ship HTML report to GitHub Pages; Slack/LINE notify on failure
- [ ] Ask ERP devs to add `data-testid` where role/label locators are ambiguous (tables, row actions)

## Known app bugs

<!-- filed via .claude/skills/report-bug — format: - repo#n — title -->

- [erp-api#13](https://github.com/iotechsoft-company/erp-api/issues/13) — POST item-groups rejects omitted optional parent; factory sends explicit null, separate contract test uses test.fail + issue annotation.
- [erp-api#14](https://github.com/iotechsoft-company/erp-api/issues/14) — read-after-write 404 under concurrent load; two Sales update regressions remain fixme.
- [erp-api#15](https://github.com/iotechsoft-company/erp-api/issues/15) — concurrent item-group writes return 500/40P01 deadlock; repro retained as fixme because the failure is intermittent (2/3 initially; 1/10 after awaiting all writes before cleanup).

- [erp-frontend#2](https://github.com/iotechsoft-company/erp-frontend/issues/2) — QT/SO/DN searches send unsupported `$contL` JSON search operator (400).
- [erp-frontend#3](https://github.com/iotechsoft-company/erp-frontend/issues/3) — QT/SO creation sends lowercase quotation document_type (400).
- [erp-frontend#4](https://github.com/iotechsoft-company/erp-frontend/issues/4) — DN form sends customer/product IDs instead of SO/SO-item IDs.
- [erp-frontend#5](https://github.com/iotechsoft-company/erp-frontend/issues/5) — QT/DN draft edit/delete UI is absent although their API supports draft CRUD.

## Phase 2 verification (2026-11-13)

- Inventory: 12 tests (6 read-only smoke, 3 validation, 3 UI CRUD); replaces the products `test.fixme`.
- Added item-group and UOM DTO factories + 2 API contract tests, plus the issue-linked optional-parent regression. Brands are not required by the forms, so no brand factory was added.
- UI tests create their own leaf item group and bundle component. The stock UOM is an existing read-only reference from the same first-100 window loaded by the UI; newly created UOMs can fall outside that window. API factory contracts still create/delete their own UOM.
- Smoke searches cover an existing record (when present) and an unmatched value. Pagination checks page 2 and its API-returned identity column when enough records exist, otherwise assert disabled/empty state without writes.
- Sort remains unimplemented in these three app pages: column definitions never set `sortable`, and the table is not passed `onSort`. Shared `DataTable.sort()` is ready for sortable tables; current specs verify the actual absence of sort controls. App source was read only.
- Pagination uses local React state; the browser URL does not gain `?page=2`. Check the active pagination button and list API response instead.
- Search completion waits for the submitted list request, preventing edit/delete from racing a previous query whose target row was already visible. Valid-form saves wait for POST/PUT success and form closure.
- Valid CRUD waits for the mutation-triggered list response and for the rendered name column to match that response after the MUI modal closes. Empty colspan rows are excluded.
- Cleanup deletes bundles before component singles and groups, and fails if any target query/delete fails.
- Mutation tests run in a dedicated Chromium project with one worker because item-group writes rebuild the shared tree; read-only tests remain parallel. Tests still seed and clean their own records.
- `pnpm check-types && pnpm lint`: passed, 0 errors / 0 warnings.
- `pnpm test --reporter=list`: exit 0; 46 executions counted as passed by the runner (45 ordinary passes, 1 expected failure for erp-api#13), no retries/skips/fixmes.
- `pnpm exec playwright test --repeat-each=2 tests/inventory --reporter=list`: 25 passed (12 inventory tests × 2 + auth setup), no retries or failures.
- `pnpm cleanup:e2e` (dry-run): exit 0; 0 E2E records in customers, suppliers, products, item-groups and uoms.

## Customers / purchasers verification (2026-11-13)

- Added `CustomersPage`, `PurchasersPage`, and their shared `PartyListPage`, using shared table/search/select/confirm/notification POMs. Fixtures and page exports are registered.
- 16 new UI tests: 4 read-only smoke, 6 validation, 4 company/individual CRUD, and 2 cancel-delete tests. All mutation cases build E2E-prefixed data and clean up through the separate API fixture, including partial UI success.
- Validation covers required code/name/tax ID; code/name/tax ID/phone length; negative customer credit limit/terms; supplier country/currency lengths and payment terms length. Messages come from the respective Thai translations.
- Supplier individual factories now generate a Thai personal name, valid personal tax ID, mobile phone and non-VAT status. Added 2 API create/read/delete contracts for individual customer/supplier factories; existing customer contract now fixes company type explicitly.
- `/purchasers` is supplier master data backed by `/api/supplier-bc/v1/suppliers`; customers use `/api/sales-bc/v1/customers`. Existing cleanup TARGETS already cover both resources, so no new entity targets were needed.
- Shared pagination accepts an explicit endpoint and identity column for these modules; existing Inventory callers retain their behavior. Neither module currently exposes sorting controls or a list filter drawer.
- Live accessible roles/labels work for all tested controls; no data-testid request was necessary. ERP source was read only.
- New tests plus individual-party contracts: `pnpm exec playwright test tests/customers tests/purchasing tests/api/party-factories.spec.ts --repeat-each=3 --reporter=list` — 55 passed (18 tests × 3 + setup), no failures/retries.
- `pnpm test --reporter=list`: exit 0, 64 executions counted as passed (63 ordinary passes + the existing expected failure for erp-api#13); no retries or skips.
- `pnpm check-types && pnpm lint`: passed with 0 errors / 0 warnings.
- No new app bugs were confirmed in customers/purchasers; no additional GitHub issues were filed.
- `pnpm cleanup:e2e` (dry-run): exit 0; 0 E2E records in customers, suppliers, products, item-groups and uoms.

## Sales verification (2026-11-13)

- New files: `src/pages/{sales-document-list,sales-create,quotations,sales-orders,delivery-notes}.page.ts`; `src/api/sales-scenario.ts`; `src/data/factories/sales.ts`; `tests/sales/{lists,quotations,orders,delivery-notes}.spec.ts`; `tests/api/sales-factories.spec.ts`.
- Updated integration files: `src/fixtures/test.ts`, `src/pages/index.ts`, `src/pages/components/index.ts`, `src/data/factories/index.ts`, `scripts/cleanup-e2e-data.ts`, `AGENTS.md`, and this roadmap.

- Added list POMs for `/sales/quotations`, `/sales/orders`, `/sales/delivery-notes`, and shared `/sales` create-form POM; page fixtures and exports are registered.
- Added CreateQuotationDTO/CreateDeliveryNoteDTO factories and 4 API contracts (2 active create/read/delete, 2 quarantined update regressions). Document numbers are server-generated; ownership uses a unique `E2E-` prefix in `remark_th` (response `remark.th`). No unsupported code/number fields are sent.
- SalesScenario seeds an owned customer with a realistic company and sufficient credit. It looks up an existing stock-bearing catalogue product/warehouse as immutable references (`product_sku`, `total_qty - expired_qty` in stock-balances); tests do not post inventory movements.
- SO has no direct POST/PUT/DELETE. It is created by converting an APPROVED quotation, and cleanup uses cancellation. API setup sends/approves a quotation before conversion, then reads its actual SO item IDs for DN creation.
- UI coverage includes list/filter/pagination; quotation customer/date/expiry validation; QT send→approve→convert→SO details/cancel; DN details, blank/whitespace cancel-reason validation, and cancellation. Known UI defects have isolated expected-failure regressions with issue annotations; source ERP files remain read-only.
- Search is broken in the app, so unblocked lifecycle specs find their owned document using normal UI pagination. Requests are never intercepted or rewritten. After state changes, re-open the list and find the document again because backend ordering may move it to another page.
- UI QT/DN edit/delete and UI QT/SO/DN creation remain blocked by the reported app defects; this roadmap item deliberately remains unchecked. SO edit/delete is unavailable by API design, not a failed locator.
- Cleanup order: DN → SO → QT → customer. Draft QT/DN can be deleted; non-drafts and SO are cancelled. Cancelled sales documents are retained audit records and cannot satisfy a literal “zero records” condition via supported APIs. The cleanup tool explicitly reports active E2E records separately from retained cancelled audit records; it does not hide or relabel them.
- New TARGETS cover delivery-notes, sales-orders, quotations by remark_th, ahead of referenced master data. Failed cleanup remains a nonzero exit code.
- Draft PUT investigation: 7/20 serial API contract runs failed with 404 after POST 201 and GET of the exact same DRAFT ID. No write retries were added. Two update cases are isolated with `test.fixme` + `flaky` annotation under flaky-hunter; create/read/delete contracts remain active. Claude independently reproduced the backend inconsistency and filed erp-api#14; both update cases now carry its issue annotation.
- Added 24 Sales cases: 20 UI cases and 4 API contracts. Of these, 8 UI cases have issue-linked expected failures and 2 API update cases are quarantined; 14 are ordinary active checks.
- DN validation initially used the default warehouse instead of the stock-bearing fixture warehouse. Selecting the fixture warehouse before adding the product fixed the setup; focused validation passed 3/3 repeats.
- `pnpm check-types && pnpm lint`: passed, 0 errors / 0 warnings; Prettier and `git diff --check` passed.
- Final `pnpm test --reporter=list`: exit 0, 88 executions — 77 ordinary passes, 9 expected failures (8 Sales plus existing erp-api#13), 2 quarantined/skipped update cases; no retries. This is not a claim that all CRUD functionality passes.
- Final `pnpm exec playwright test tests/sales tests/api/sales-factories.spec.ts --repeat-each=2 --retries=0 --reporter=list`: exit 0, 49 executions — 29 ordinary passes, 16 issue-linked expected failures, 4 quarantined/skipped update executions. No unexpected failures or retries; quarantined PUT is not claimed stable.
- Final `pnpm cleanup:e2e` dry-run: exit 0; 0 active Sales E2E records and 0 records in all master-data targets. Retained cancelled audits: 7 DN, 64 SO, 65 QT (136 total). Literal zero total Sales records is not achieved because the API retains cancelled audit documents.

## Review handoff (combined pending work)

- Branch `codex/inventory-customers-sales` gathers existing uncommitted Inventory/customers/Sales work as explicitly requested; future work uses one PR per module.
- Reviewer-reported product factory and single/bundle UI CRUD all passed 3/3 focused repeats. Explicit null parent in factories and serialized mutation projects prevent the prior setup/tree-write collisions; the optional omitted-parent case remains issue-linked expected failure (#13).
- Restored the concurrent item-group repro instead of deleting it. POST returns a real 500/40P01 deadlock intermittently; waiting for all concurrent writes before cleanup fixes early cleanup but does not fix the backend deadlock. Retained as issue-linked fixme (#15), avoiding random unexpected passes with unconditional test.fail.
- Final combined verification: `pnpm test --repeat-each=2 --retries=0 --reporter=list` exited 0, 177 executions: 153 ordinary passes, 18 expected-failure executions (#13 and frontend #2–#5), 6 fixme executions (race #15 and two update cases #14 repeated twice). No retries or unexpected failures.
- `pnpm check-types && pnpm lint`: exit 0 with 0 errors / 0 warnings.
- Final cleanup dry-run: 0 active Sales E2E records and 0 master-data E2E records. Cancelled audit rows retained: DN 9, SO 74, QT 75 (158 total); supported API operations do not delete these audits.
- PR must be reviewed by Claude; no merge performed.

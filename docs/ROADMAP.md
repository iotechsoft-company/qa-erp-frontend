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
- [ ] customer: customers · supplier: purchasers
- [ ] sales: quotations, orders, delivery-notes, create
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

## Phase 2 verification (2026-11-13)

- Inventory: 12 tests (6 read-only smoke, 3 validation, 3 UI CRUD); replaces the products `test.fixme`.
- Added item-group and UOM DTO factories + 2 API contract tests. Brands are not required by the forms, so no brand factory was added.
- UI tests create their own leaf item group and bundle component. The stock UOM is an existing read-only reference from the same first-100 window loaded by the UI; newly created UOMs can fall outside that window. API factory contracts still create/delete their own UOM.
- Smoke searches cover an existing record (when present) and an unmatched value. Pagination checks page 2 and its API-returned identity column when enough records exist, otherwise assert disabled/empty state without writes.
- Sort remains unimplemented in these three app pages: column definitions never set `sortable`, and the table is not passed `onSort`. Shared `DataTable.sort()` is ready for sortable tables; current specs verify the actual absence of sort controls. App source was read only.
- Pagination uses local React state; the browser URL does not gain `?page=2`. Check the active pagination button and list API response instead.
- Search completion waits for the submitted list request, preventing edit/delete from racing a previous query whose target row was already visible. Valid-form saves wait for POST/PUT success and form closure.
- Valid CRUD waits for the mutation-triggered list response and for the rendered name column to match that response after the MUI modal closes. Empty colspan rows are excluded.
- Cleanup deletes bundles before component singles and groups, and fails if any target query/delete fails.
- Final verification results are recorded below after the full suite and cleanup complete.

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

- [ ] Shared components POM: data table (sort/paginate), search box, filter drawer, confirm dialog, snackbar, form select/autocomplete (MUI)
- [ ] inventory: products, item-groups, product-groups
- [ ] customer: customers · supplier: purchasers
- [ ] sales: quotations, orders, delivery-notes, create
- [ ] purchasing: orders, goods-receipts, create
- [ ] reports: sales, purchases (filters + export)
- [ ] settings: shop, sales, item-groups

## Phase 3 — Regression / CRUD (`@mutation`, dev)

- [ ] More factories from `.openapi/*.json`: customer-groups, supplier-groups, brands, item-prices, quotations, sales-orders, purchase-orders, goods-receipts
- [ ] Extend `scripts/cleanup-e2e-data.ts` TARGETS for each new entity

- [ ] Product CRUD (+ image upload via presigned flow)
- [ ] Sales flow: quotation → order → delivery note
- [ ] Purchase flow: PO → goods receipt → stock balance changes
- [ ] Validation errors (zod/react-hook-form messages in TH)

## Phase 4 — Extras

- [ ] Permission tests with `e2e.staff` (`requireStaffCredentials()`, ROLE_STAFF = everything except user management) → hidden buttons / 403. Add a second storageState in setup
- [ ] Visual regression with `toHaveScreenshot` on stable pages
- [ ] Accessibility checks with `@axe-core/playwright`
- [ ] Report: Allure or ship HTML report to GitHub Pages; Slack/LINE notify on failure
- [ ] Ask ERP devs to add `data-testid` where role/label locators are ambiguous (tables, row actions)

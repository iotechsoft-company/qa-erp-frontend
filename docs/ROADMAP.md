# Roadmap / TODO for next agent

## Business workflow priorities (2026-11-17)

Coverage source of truth: [Business workflow matrix](WORKFLOW_COVERAGE.md), เทียบ [คู่มือระบบ](https://iots1.github.io/plan-erp/api-workflow-guide.html) กับ Purchasing baseline PR #3 (merge `ebcb6a7`) และ Receiving PR #6, review follow-ups PR #8, Sales fulfillment PR #9 (`1979af6`) ที่ merge แล้ว ครบ 25 รหัสหลักและหัวข้อย่อยในเนื้อหา รวม C9, A3.1, B5.1, E2.1, E2 P6 และ E3.1–E3.2; ตัวเลข 21/23 flows หน้าแรกไม่ใช้เป็น denominator

**สถานะรวม: ยังไม่ครบ business workflow ทั้งระบบ** ไม่มี flow หลักใดที่ยืนยันครบทุกทางเลือก สิทธิ์ และผล stock/บัญชีตามคู่มือแล้ว การติ๊ก Phase 2 หมายถึงขอบเขตหน้า/POM/CRUD ที่ระบุเท่านั้น ไม่ใช่ business flow ทั้งสาย ผลรันตามวันที่ด้านล่างเป็นประวัติ ผลรันใหม่ของ P0.2/P0.3 แยกไว้ใน verification ด้านล่าง

| สถานะ             | ขอบเขตปัจจุบัน                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ทำแล้วในขอบเขตที่ระบุ | Inventory/party UI CRUD และ Thai validation; QT ที่ seed ผ่าน API→UI send/approve/convert SO/cancel; PO UI create/approve/send/cancel; GR UI receive พร้อม stock assertions และ **API cancellation workaround**; P0.2 เพิ่ม partial/full received_qty, ส่วนลด 4 modes, exact rejections และ Lot/ledger reversal; P0.3 เพิ่ม submitted DN/credit/partial→closed, owned stock/COGS/profit/GL reversal; P1.1 เพิ่ม D1/D2 core API qty/cost/lot/ledger/approval/reversal; P1.2 เพิ่ม A4/B4 API returns/COGS/GL reversal และ PRN UI history; P1.3 core AP/receipt/CN/DN API, tax/discount/AR/AP/GL reversal; P1.4 core billing/payment/schedules/credit/refund API, FX/WHT/credit-pool/GL reversal |
| บางส่วน + บั๊กขวาง   | A1 tree concurrency: api#15; api#13 optional parent has a healthy regression after deploy; A2–A3 draft edit/delete/cancel และ PUT: frontend#6/#7, api#14; B1–B3 search/draft controls และ PUT: frontend#2/#5, api#14; frontend#3/#4 มี healthy regressions หลัง deploy fix; D1/D2 PUT: api#14, pending adjustment cancel: api#18; A4 UI create: frontend#14; A4/B4 และ Finance AP/receipt PUT: api#14                                                                                                                                                                                                                                                                              |
| ยังขาดทั้ง workflow  | A3.1 barcode; B5/B5.1 POS; C6/C8/C9 finance workflows (C7 มี owned-party API net-balance assertions; มี COGS/profit/GL side effects จาก DN แล้ว); E2/E3 และหัวข้อย่อย                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ยังขาดบางส่วน       | C3–C5/C10 UI, permissions, multi-source/printing/remaining variants; A1 masters/settings/integrity; A2–A3 remaining multi-line/warehouse/UOM/return/period guards; B1–B3 remaining FEFO execution, permissions, mixed-lot delivery และ document guards; E1 report UI (มี stock-balance/Lot/ledger assertions ใน GR แล้ว); role permissions และ cancel ทั้งสาย                                                                                                                                                                                                                                                                                                                        |

สถานะ issue เดิมอ้างผลตรวจ GitHub เมื่อ 2026-11-15; api#18 เพิ่มและตรวจ OPEN เมื่อ 2026-11-16 ลิงก์และหลักฐานอยู่ใน Known app bugs และ matrix; “ยังขาด” ไม่ได้หมายความว่าพบบั๊ก ส่วน bug characterization ที่ผ่านหรือ fixme ที่ข้ามไม่นับว่า healthy workflow ผ่าน

### ลำดับงานถัดไป

ลำดับนี้เน้นความถูกต้องของ stock/เงินและ dependency ก่อนเพิ่มความกว้างของหน้า แต่ละงานใช้ branch/PR ตาม module และเพิ่ม owned factories/contracts/cleanup ก่อน mutation ทุกครั้ง งานที่รอแก้แอปแยกจากงานที่เริ่มได้ทันที

| ลำดับ | งาน / flow                                                                                                                                   | เริ่มได้เมื่อ / หลักฐานที่ต้องได้ก่อนปิด                                                                                                                                                                                                                                           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0.1 | PR #8/#9 merge แล้ว; ติดตาม api#14/#15, frontend#2–#7; api#13 optional parent healthy after deploy                                             | แก้ตาม review บน branch เดิม; เมื่อแอปแก้แล้วเปลี่ยนเฉพาะ characterization เป็น healthy assertions และเปิด PUT/race ตามหลักฐาน ไม่ retry writes; ต้อง rerun affected specs ซ้ำและ cleanup ก่อนปิด blocker                                                                              |
| P0.2 | P0.2 receiving implementation: partial/multiple receipts, over-receipt, qty/totals/discount modes, PO/GR states และ Lot/ledger/PO quantities | Implemented on codex/purchasing-receiving; ตรวจ UI partial/full receipt และส่วนลด, API errors/reversal ตาม frontend#7; merged PR #6 (`58a6b44`); follow-ups tracked below; ขอบเขตเต็ม A2–A3 ยังเปิด                                                                        |
| P0.3 | B1–B3 healthy QT→SO→submitted DN→stock reversal/COGS/profit                                                                                  | Merged PR #9 (`1979af6`): credit hold/approval, partial→closed, configured FIFO, shortages/expiry, source totals, COGS/profit/GL reversal; FEFO execution/roles/remaining guards ยังเปิด; UI edit/delete/search รอ frontend#2/#5; ใช้ owned GR stock ไม่แก้ shared settings |
| P1.1 | D1 ทั้ง 4 entry types และ D2 counted stock/approval/reversal                                                                                   | Implemented core API scope on codex/stock-operations: all 4 types, count/approval/fresh baseline, qty/cost/ledger/reversal and guards; UI ยังไม่มี; PUT api#14/pending cancel api#18 ขวางบางส่วน; frozen/permissions ยังเปิด ไม่แก้ shared settings                            |
| P1.2 | A4 supplier returns และ B4 customer returns                                                                                                  | Merged PR #11 (`dfda31a`), core API: partial/full returns, original lot/cost, PO/SO net status, guards, COGS/GL reversal; PRN UI history/details ผ่าน; create ติด frontend#14, B4 ไม่มี UI, PUT api#14 quarantined; permissions/UOM/frozen/finance docs ยังเปิด              |
| P1.3 | A5 AP invoice/CREDIT_NOTE และ C1–C2 receipt/CN/DN                                                                                            | Merged PR #12 (`1917405`): owned document core API/GL/totals/guards; finance UI absent, AP/receipt PUT api#14 quarantined; remaining variants below                                                                                                                    |
| P1.4 | C3–C5 billing/payment/schedules และ C10 customer/supplier credit/refund                                                                      | Merged PR #13 (`f4bdb02`): partial/full/overpayment, USD gain/loss/WHT, remaining debt/credit/GL/reversal and exact guards; UI absent, permissions/multi-source/printing remain open; final verification below                                                         |
| P1.5 | Cancel ทั้งสาย + permission matrix ของ flow ที่เพิ่ม                                                                                               | ทำควบคู่ P0–P1; Sales/Purchase/Warehouse ย้อนปลายน้ำ→ต้นน้ำ, wrong order ไม่มีผลข้างเคียง, DRAFT child guards; staff roles/menu/button/403 และแยก storage state                                                                                                                  |
| P2.1 | B5 POS และ B5.1 held/complete/resolve                                                                                                        | ต่อจาก stock+receipt/payment primitives; cover sale/void ทั้ง stock/finance, payment/discount/VAT และ double completion; recovery/fault injection ใช้ env ควบคุมได้                                                                                                          |
| P2.2 | A3.1 barcode/UOM และ A1 masters/settings ที่เหลือ                                                                                               | Barcode/conversion factories ก่อน scanner scenarios; parallel module PRs สำหรับ groups/brands/prices/variants/history/attachments; settings mutations ที่เป็น global ใช้ isolated env                                                                                        |
| P2.3 | E1–E2 reports/P6, C7 aging, C8 VAT และ E2.1 financial statements                                                                             | ต่อจาก owned source documents; UI filters/export พร้อมยอดตรง source/GL, freshness/rollup และ cancellation; read-only UI smoke เริ่มได้ก่อน แต่ไม่นับว่า reconciliation เสร็จ                                                                                                      |
| P2.4 | E3.1 typed print และ E3.2 template/render                                                                                                    | PDF content/totals/locale/company/branch, permissions, print snapshots/history/copy numbering; เพิ่ม presigned attachment/image flow ใน A1                                                                                                                               |
| P3   | C6 close-period/FX และ C9 settings audit พร้อม frozen-period guards ทุกโมดูล                                                                    | เตรียม disposable isolated env ก่อน irreversible close/global setting changes; assert FX revaluation/auto-reverse/rollback และ audit old/new/no-op; read-only logs เริ่มได้ก่อน                                                                                              |

### Backlog checklist ตาม business flow

รายการเหล่านี้ยังไม่ติ๊กแม้มีบางขั้นแล้ว ดูขอบเขตทำแล้ว/ขาด/บั๊กเป็นราย flow ใน matrix

- [x] ทำ coverage inventory เทียบทุก flow/หัวข้อย่อยของคู่มือ พร้อม spec evidence และ blocker mapping
- [ ] A1 master/settings ครบ §09 รวม integrity, variants, UOM/barcode, prices, histories และ uploads
- [ ] A2–A3 PO/GR ครบ lifecycle/partial/guards และ full UI หลังแก้บั๊ก
- [ ] A3.1 barcode receiving และ pack conversions
- [x] P1.2 core API A4/B4 returns, original lot/cost/net qty, guards และ stock/COGS/GL reversal; PRN UI history/details
- [ ] A4/B4 full UI, PUT, permissions, multi-UOM/frozen-period และ finance integration
- [x] P1.3 core API A5 AP invoice/credit note และ C1–C2 receipt/CN/DN; owned finance cleanup + PR #11 label nit
- [ ] A5/C1–C2 full UI/permissions/frozen/FX/multi-line/mixed VAT และ AP/receipt PUT หลัง api#14
- [ ] B1–B3 QT→SO→DN ครบ UI/stock/credit/COGS/reversal หลังแก้บั๊ก
- [ ] B5 POS immediate; B5.1 held/complete/recovery
- [ ] C1–C2 receipts/tax invoices/CN/DN; C3 billing; C4 payment; C5 schedules
- [ ] C6 period close/FX; C7 aging; C8 VAT; C9 settings audits; C10 credit/refund
- [x] P1.1 core API: D1 ทั้ง 4 แบบ; D2 count/approval/reversal/guards และ owned cleanup (รายละเอียดด้านล่าง)
- [ ] D1/D2 full UI/PUT/pending cancel/permissions/frozen-period — ดู blockers/gaps ใน matrix
- [ ] E1 stock reports; E2 accounting/profit/P6; E2.1 statements; E3.1/E3.2 print
- [ ] Cross-flow permissions, cancellation dependency, immutable/DRAFT guards และ stock/GL reconciliation

## Historical implementation and verification

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
- [ ] inventory: POMs/list/validation and single-product/item-group UI CRUD implemented; owned bundle CRUD is now blocked by frontend#44 candidate-window lookup and quarantined. Restore that flow after the app fix; sort UI remains unavailable.
- [x] customer: customers · supplier: purchasers — list/search/pagination, create/edit POMs, company + individual UI CRUD, delete cancellation, Thai required/length and module-specific validation.
- [ ] sales: quotations, orders, delivery-notes, create — POMs, draft API create/read/delete (update quarantined), list/filter/pagination, UI QT→SO lifecycle and DN read/cancel validation implemented; full UI CRUD remains blocked by erp-frontend#2/#5; create regressions for #3/#4 migrated after deployed fixes (see Sales migration verification).
- [ ] purchasing: orders, goods-receipts, create — list/create POMs, smoke, Thai validation, PO approve/send/cancel and GR UI receipt/stock reversal covered; full UI CRUD/cancel blocked by frontend#6/#7 and draft PUT quarantined under api#14 (see Purchasing verification).
- [ ] reports: sales, purchases (filters + export)
- [ ] settings: shop, sales, item-groups

## Phase 3 — Regression / CRUD (`@mutation`, dev)

- [ ] More factories/contracts/cleanup from `.openapi/*.json`: customer-groups, supplier-groups, brands, item-prices and remaining workflow entities (QT/DN and purchasing PO/GR factories are implemented; SO is created by QT conversion, not direct POST)
- [x] Extend `scripts/cleanup-e2e-data.ts` TARGETS for new Phase 2 entities: item-groups and uoms (`name_th`, response `name.th`). Extend again when later factories are added.

- [ ] Single-product UI CRUD is active; owned bundle UI CRUD is quarantined under frontend#44, with API cleanup and an active exact read-only lookup characterization.
- [ ] Product image upload via presigned flow
- [ ] Sales flow: quotation → order → delivery note
- [x] Purchase flow: PO → goods receipt → stock balance changes — merged in PR #6 (`58a6b44`), with explicit API GR cancellation workaround for frontend#7; full A2/A3 gaps remain in the matrix
- [x] Inventory required-field validation errors (Thai), including bundles requiring at least one component
- [ ] Validation errors in remaining modules/flows — customer/supplier required/length/domain validation, Sales customer/date and Purchasing document-date/zero-qty/cancel-reason checks are implemented; see workflow matrix for gaps

## Phase 4 — Extras

- [ ] Permission tests with `e2e.staff` (`requireStaffCredentials()`, ROLE_STAFF = everything except user management) → hidden buttons / 403. Add a second storageState in setup
- [ ] Visual regression with `toHaveScreenshot` on stable pages
- [ ] Accessibility checks with `@axe-core/playwright`
- [ ] Report: Allure or ship HTML report to GitHub Pages; Slack/LINE notify on failure
- [ ] Ask ERP devs to add `data-testid` where role/label locators are ambiguous (tables, row actions)

## Known app bugs

- [erp-frontend#44](https://github.com/iotechsoft-company/erp-frontend/issues/44) — bundle component lookup is restricted to its first100 candidates; healthy read-only lookup failed3/3 despite valid detail200. One owned bundle CRUD quarantine; exact read-only characterization stays active.

- [erp-frontend#14](https://github.com/iotechsoft-company/erp-frontend/issues/14) — SUBMITTED GR return action hidden by lowercase status comparison; reproduced 3/3, active exact characterization; full UI create/zero-qty validation blocked.

<!-- filed via .claude/skills/report-bug — format: - repo#n — title -->

- [erp-api#13](https://github.com/iotechsoft-company/erp-api/issues/13) — deployed healthy behavior verified 2026-11-19: omitted parent creates/reads a root leaf (10/10); issue annotation retained, GitHub issue still OPEN. Explicit-null factories remain valid; old expected400 characterization replaced.
- [erp-api#14](https://github.com/iotechsoft-company/erp-api/issues/14) — read-after-write 404 under concurrent load; Sales/Purchasing/Stock/Returns/Finance AP+receipt update regressions remain fixme (Finance occurrences added 2026-11-16); no write retries.
- [erp-api#15](https://github.com/iotechsoft-company/erp-api/issues/15) — concurrent item-group writes return 500/40P01 deadlock; repro retained as fixme because the failure is intermittent (2/3 initially; 1/10 after awaiting all writes before cleanup).

- [erp-frontend#2](https://github.com/iotechsoft-company/erp-frontend/issues/2) — QT/SO/DN searches send unsupported `$contL` JSON search operator (400).
- [erp-frontend#3](https://github.com/iotechsoft-company/erp-frontend/issues/3) — uppercase document_type fix deployed in erp-frontend PR #1; healthy QT/SO create regressions pass (issue metadata still OPEN when checked).
- [erp-frontend#4](https://github.com/iotechsoft-company/erp-frontend/issues/4) — real SO/SO-item mapping fix deployed in erp-frontend PR #1; healthy draft DN regression passes (issue metadata still OPEN when checked).
- [erp-frontend#5](https://github.com/iotechsoft-company/erp-frontend/issues/5) — QT/DN draft edit/delete UI is absent although their API supports draft CRUD.
- [erp-frontend#6](https://github.com/iotechsoft-company/erp-frontend/issues/6) — purchasing draft PO/GR edit/delete UI absent; API draft CRUD supported.
- [erp-frontend#7](https://github.com/iotechsoft-company/erp-frontend/issues/7) — submitted GR cancel hidden by RECEIVED PO status; API cancellation reverses stock correctly.

- [erp-api#18](https://github.com/iotechsoft-company/erp-api/issues/18) — cancelling PENDING_APPROVAL stock adjustment incorrectly requires counted stock/reversal; exact signature regression, owned cleanup approves then reverses.

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

## PR #2 review revision

- Fixed smoke race: customer/supplier search excludes E2E codes; no stable visible code falls back to an unmatched search and empty-state assertion.
- Replaced all eight broad Sales expected failures with issue-linked bug characterizations. They require the exact request mapping, HTTP status and error signature (or an existing DRAFT with details loaded and both edit/delete controls absent); unrelated locator/network/cleanup errors fail normally. A bug fix turns its characterization red and requires migration to the healthy flow.
- createOrder now returns the approval response when approval was needed; API contracts require CONFIRMED only. Stock references require a warehouse ID on the same balance row.
- Removed the 30-page findRecord cap; pagination goes to the real last page and reports the actual pages scanned. ERP list helpers expose only local page/search/status state, so adding a sort URL parameter would not affect UI requests; no request rewriting was added.
- Added shared cleanup transition policy used by fixtures and cleanup script, with three read-only policy tests. Converted QT stays retained until SO cancellation clears its link; cleanup re-reads QT afterwards. Terminal/unsupported states are explicitly retained. Customer cleanup is attempted even if document cleanup fails, then failures are aggregated.
- Restored ignored non-E2E row logging; Sales form now uses DataTable.cell for column lookup and a row scoped by exact rendered SKU text. Moved E2E IDs to leaf ids.ts, removing the circular barrel import; no generated SKU format change.
- allowImportingTsExtensions supports the cleanup script’s native Node TypeScript import of the shared policy (noEmit remains enabled).
- Review revision validation: `pnpm test --repeat-each=2 --retries=0 --reporter=list` exited 0, 183 executions: 175 ordinary passes (including the 16 Sales bug-characterization executions), 2 expected-failure executions for erp-api#13, and 6 fixme executions for #14/#15. No retries or unexpected failures.
- `pnpm check-types && pnpm lint`: exit 0, 0 errors / 0 warnings. Final dry-run cleanup after removing one owned set left by an interrupted preliminary run: 0 active Sales and 0 master-data E2E records, 0 non-cancellable active remainders. Cancelled audits retained: DN 12, SO 89, QT 90 (191 total). No inventory stock was posted.

### Follow-up after PR #2

- [ ] Narrow serialized mutation execution to inventory tree writes in a separate PR; benchmark other mutation workers against the current baseline and backend concurrency issues #14/#15 before increasing parallelism. Deferred review comment: https://github.com/iotechsoft-company/qa-erp-frontend/pull/2#discussion_r4565831133

## PR #2 re-review follow-up

- Reviewer marked 165566a ready to merge; retained worker serialization as an agreed follow-up.
- Addressed the additional non-blocking suggestion in this PR: item-group optional-parent case now asserts HTTP 400, status code 400000 and the exact leaf-parent message, keeping issue #13 annotation and API cleanup. No broad test.fail remains for this case. A fixed backend, different error, auth failure, network failure or cleanup failure fails normally.
- ApiClient.postResponse exposes the authenticated/CSRF-protected raw response for error contracts; normal post/create use the same request path and still throw on non-2xx.
- Follow-up validation: `pnpm check-types && pnpm lint` passed with 0 errors / 0 warnings; `pnpm exec playwright test tests/api/item-groups.spec.ts tests/api/factories.spec.ts --repeat-each=2 --retries=0 --reporter=list` passed 13 executions (including setup), no expected failures/retries/skips. Final cleanup dry-run: 0 active Sales and 0 master-data E2E records; cancelled audits remain DN 12, SO 89, QT 90. No merge performed.

## Purchasing verification (2026-11-14)

- Branch `codex/purchasing`; new `PurchaseOrdersPage`, `GoodsReceiptsPage` (shared `PurchaseDocumentsPage`) and `PurchaseCreatePage`. Registered exports/fixtures and extended shared table identity fields for po_number/grn_number.
- New files: `src/pages/purchase-{documents,create}.page.ts`, `src/data/factories/purchasing.ts`, `src/api/purchasing-scenario.ts`, `src/data/purchasing-cleanup.ts`, `tests/purchasing/documents.spec.ts`, and `tests/api/purchasing-{factories,cleanup}.spec.ts`.
- Added 25 cases: 17 UI (8 read-only smoke and 9 mutation/lifecycle/validation/bug-signature cases), 6 API contracts (2 create/read/delete, 2 DTO zero-quantity checks, 2 quarantined PUT), and 2 cleanup-policy checks.
- Factories match fetched CreatePurchaseOrderDTO and CreateGoodsReceiptDTO: uppercase PO enum, ISO dates, realistic Thai remarks, real PO item IDs, E2E lot number; server generates document numbers. Mutation scenarios own supplier/product and read only existing leaf item group/UOM/stock warehouse references.
- UI coverage: create PO -> draft list/details; approve -> send -> cancel with blank/whitespace cancel-reason checks; receive a sent PO through UI and direct create GR mode, verifying stock +1 and API cancellation -> stock 0 / PO SENT. GR cancellation is explicitly API-based because frontend#7 prevents the UI action; no claim of full UI CRUD.
- Validation covers empty forms disabled, Thai missing document date and zero-quantity confirmation in both modes, and exact API DTO rejection for qty=0. API failures unrelated to a known bug fail normally; no broad test.fail was added.
- frontend#6: both draft edit/delete probes failed 3/3 per document kind; frontend#7: submitted-GR cancel probe failed 3/3. Issue-linked characterizations verify a real draft/submitted record, its loaded details and absent controls. A frontend fix turns those checks red for migration to healthy flows.
- api#14 occurrence extended to Purchasing: PUT returned 404 after POST and exact-ID GET succeeded. Isolated PO measurement failed 5/10; GR passed 10/10 isolated but also failed in the preceding combined scope. Only two update cases remain issue-linked fixme; write retries/sleeps/timeouts were not added. Evidence comment: https://github.com/iotechsoft-company/erp-api/issues/14#issuecomment-6874247155
- Cleanup targets GR before PO and master data. Drafts delete; submitted GR cancels/reverses stock; PO cancellation obeys allowed states and net-received guard. Partial seed success is found by owned SKU/code; nonzero stock prevents product deletion. Cancelled receipts/orders and reversed stock history remain audit records and are counted explicitly.
- Setup gotchas corrected: stock-balances uses report query params, warehouse must be stock leaf, optional code affects warehouse labels, nested modal close assertions must target the specific dialog title. No ERP source edits or data-testid requests were needed.
- `pnpm check-types && pnpm lint`: exit 0, 0 errors / 0 warnings. Prettier and git diff --check passed.
- New Purchasing specs repeated 3 times with retries=0: exit 0, 76 executions = 70 passed + 6 fixme/skipped update executions. No unexpected failures.
- Full `pnpm test --retries=0 --reporter=list`: exit 0, 117 executions = 112 passed + 5 fixme/skipped cases (existing Sales update x2/race x1 plus Purchasing update x2). No expected-failure markers or retries. Known UI bug characterizations pass while the exact defects exist.
- Final cleanup dry-run after clearing four owned products left by the early stock-query setup error: 0 active E2E documents, 0 master-data E2E records and 0 non-cancellable remainders. Retained cancelled audits: GR 20, PO 63, DN 13, SO 94, QT 95 (285 total); reversed stock history/zero-quantity lots are retained by the system. This is not zero total audit rows.
- Purchasing remains unchecked pending review and the stated application gaps. No merge performed.

## PR #3 review revision (2026-11-15)

- Addressed required review findings: bounded read-only PO/stock reversal checks inside scenario cleanup, CLI stock guard (unreadable/nonzero stock blocks product deletion with nonzero exit), completed-GR row assertions, and explicit RECEIVED PO precondition for frontend#7.
- Also addressed unowned-row skipping, conditional/deferred dry-run PO reporting and purchasing-specific relation labels, Bangkok calendar dates, and row-scoped receipt cells. Added `createReceipt`/`orderStatus` helpers and consolidated Purchasing cleanup action handling.
- Added a live interrupted-GR cleanup regression and two local CLI transport regressions: failed GR cancellation cannot delete a stocked product even when the transport would allow DELETE; dry-run reports the PO dependency without claiming cancellation. No real ERP data is used by the CLI stub tests.
- Cross-module Sales/Purchasing cleanup-helper extraction (review suggestion #9) is deferred to a focused follow-up; Purchasing already computes the action once in one helper. Sales transition/ownership behavior is unchanged by this revision.
- Seed prerequisites now use bounded read-only visibility checks for a newly created product and each PO state transition. No write retries were introduced; draft PUT remains quarantined under api#14.
- Review validation: affected Purchasing UI/contracts/cleanup/CLI specs with `--repeat-each=2 --retries=0` passed 53 executions with 4 existing PUT fixme executions skipped; no unexpected failures or retries in the final run. Types/lint/formatting passed. Dry-run cleanup: 0 active E2E and 0 master-data leftovers; retained cancelled audits GR 40 / PO 100 / DN 13 / SO 94 / QT 95 (342 total).

## P0.2 Receiving verification (2026-11-15)

- [x] Implement UI partial receipt 2/5→PARTIAL→3/5→RECEIVED; assert the owned line received_qty and stock at every step, then API cancellation returns 5→2→0 (frontend#7 workaround).
- [x] Assert over-receipt exact allowance error at submit with unchanged PO/stock/Lot/ledger; allowance is read from existing settings, never changed.
- [x] Cover all four PO discount modes through UI (amount line/percent header) and API factory contracts (percent line/amount header, ignored fields), independently asserting qty×cost, line totals and header totals.
- [x] Reject DRAFT/CANCELLED parent PO, submission of a draft GR after PO cancellation, and repeated GR submit/cancel; verify exact errors and unchanged business snapshots.
- [x] Verify GR Lot identity/cost/qty and source-linked RECEIPT→negative ADJUSTMENT ledger, zero net cost and stock after reversal. Historical lot received_qty and audit history remain.
- Added 14 cases (10 receiving/UI cases + 4 API discount contracts); existing PO/GR resources already have cleanup targets. No ERP source/settings/shared stock changes. Coverage A2/A3 remains partial for the separately listed multi-line/warehouse/UOM/returns/finance/period gaps.
- New specs `--repeat-each=2 --retries=0`: 29 passed, no retries/skips/failures. Types/lint pass with 0 errors/warnings.
- First full-suite run: 126 passed, 5 existing fixme, 3 obsolete Sales bug-characterization failures after erp-frontend PR #1 merged during the run (uppercase document_type and real SO references). These require a separate healthy-flow migration, not looser expectations. No Receiving test failed.
- Cleanup after the interrupted Sales conversion: 0 active E2E and 0 master-data leftovers; retained cancelled audits GR 56 / PO 123 / DN 14 / SO 101 / QT 102 (396 total). Healthy Sales migration is isolated in [PR #5](https://github.com/iotechsoft-company/qa-erp-frontend/pull/5); final integration validation follows below.

## Sales create migration after frontend PR #1 (2026-11-15)

- [Frontend PR #1](https://github.com/iotechsoft-company/erp-frontend/pull/1) deployed uppercase quotation document_type and the QT send→approve→convert chain for SO/DN creation while P0.2 full-suite verification was running. Replaced the three obsolete frontend#3/#4 bug characterizations with healthy create/read assertions, retaining issue annotations. Other Sales issue characterizations remain unchanged.
- `SalesCreatePage.create()` waits for the final create/conversion response and success dialog, so cleanup cannot race an in-flight SO conversion. SO verifies its APPROVED uppercase QT; DN verifies real SO/SO-item references and DRAFT status.
- Migrated cases seed their own supplier/product/GR stock through `SalesScenario(api, new OwnedSalesStock(api))`, verify create does not consume the one owned unit, then clean Sales documents before reversing Purchasing stock. Shared catalogue stock is never mutated.
- Affected three cases repeated twice with retries=0: 7 passed including setup. Types/lint passed with 0 errors/warnings. Integrated suite verification with P0.2 is recorded on the Receiving branch/PR.

### P0.2 final integrated validation

- `pnpm test --retries=0 --reporter=list`: exit 0, 134 executions = 129 passed + 5 existing fixme/skipped (four Sales/Purchasing PUT cases under api#14 and the item-group race under api#15). No retries, expected-failure markers, or unexpected failures. This Receiving checkout includes the separately reviewable healthy Sales migration from PR #5.
- `pnpm check-types && pnpm lint`: passed, 0 errors / 0 warnings. Prettier, diff whitespace, 25 primary coverage IDs and local Markdown targets checked.
- Final cleanup dry-run: 0 active E2E documents, 0 master-data leftovers and 0 non-cancellable remainders. Retained cancelled audits: GR 73 / PO 145 / DN 15 / SO 111 / QT 112 = 456 total; lot and ledger history remains.
- No new app issue was filed: the unrelated full-suite failures were obsolete Sales bug expectations after a deployed fix, migrated in a separate PR rather than skipped. PR #3 fixes were pushed/re-reviewed first and merged by Claude; PR #4 was synced with main using merge to resolve its squash-related conflicts. Receiving, Sales migration and coverage PRs require reviewer action; Codex did not merge any PR.

- Main dependency sync: PR #4 merged as `0737711` and Sales migration PR #5 merged as `316f4cf`; both are now included through merge of origin/main. Receiving subsequently merged as `58a6b44`; follow-up PR #8 subsequently merged as `9fe3326`; P0.3 PR #9 remains under review.

## PR #5 / #6 review follow-ups (2026-11-15)

- Disposition for all 11 grouped findings: [REVIEW_FOLLOWUPS.md](REVIEW_FOLLOWUPS.md). Ten implemented; Receiving R4 has a uniqueness guard and an explicit app test-id/accessibility request because the inline summary has no stable accessible container. No MUI/ancestor selectors or ERP source changes were introduced.
- Sales create monitors failures throughout its chain and waits for the translated success heading before returning the final observed approval/conversion response. Owned stock uses constructor composition; cleanup preserves Sales and inventory errors together, and unchanged draft stock is checked through a bounded sample window plus ledger identity. QT/SO/DN remark ownership is asserted.
- Purchasing numeric domain-error assertions tolerate representation only, preserving exact code/IDs/quantities. Snapshots strip read metadata, ledger references the submitted GR number, and PO read models/helpers live under src/api.
- Focused final affected guards/create cases with repeat-each=2 and retries=0: 21 passed including setup. New local tests do not call the ERP; live cases own their supplier/product/stock and clean up through api.
- P0.3 (healthy QT→SO→submitted DN→stock/COGS) is a separate PR; the follow-up itself does not mark that workflow complete. Its subsequent implementation is recorded below.

- Final follow-up verification: `pnpm test --retries=0 --reporter=list` exited 0 with 136 passed + 5 existing fixme (141 executions), no retries/unexpected failures; types/lint/formatting pass. Final cleanup dry-run: 0 active E2E, 0 master-data leftovers, 0 non-cancellable remainders. Retained cancelled audits GR 106 / PO 189 / DN 18 / SO 133 / QT 134 = 580; lot/ledger history remains.

## P0.3 Sales fulfillment (2026-11-15)

- [x] Core UI QT→SO→DRAFT DN→SUBMITTED→CANCELLED; owned stock deduction/reversal, source identities and quantities.
- [x] API-linked draft DN→UI partial/full shipment→SO PARTIAL/CLOSED→cancel reopens CONFIRMED; line discount and ex-VAT revenue allocation, configured lot strategy, exact ISSUE lot/cost identities.
- [x] Owned customer credit limit→SO PENDING_APPROVAL→UI approve; DN PENDING_APPROVAL has no stock/COGS effect; UI approve cuts stock and cancellation reverses it.
- [x] UI SO conversion rejects insufficient/expired-only stock; UI DN submit rejects stock consumed after confirmation; exact 409 domain responses and unchanged owned state. Delivered SO cancellation is rejected without side effects.
- [x] Finance COGS/profit rows link to actual DN item/lot; journals debit=credit, cancellation preserves balanced mirror history and removes COGS/profit rows.
- [x] Factory contract covers GR expiry/qty/cost and quotation per-item discount copied into SO. Existing resource cleanup targets cover all created masters/documents; lots/stock ledger/GL remain audit history.
- [ ] FEFO execution (dev currently FIFO): code validates the configured strategy, but a successful FIFO run is not evidence of FEFO. Use an isolated FEFO environment; do not mutate shared settings.
- [ ] Existing-SO selection in the DN create form, mixed-lot allocation in a single shipment, remaining discount/price-tolerance/rounding cases, permissions and return/period/dependency guards. Full B1–B3 stays unchecked in the matrix.

P0.3 includes review follow-up PR #8 (squash-merged as `9fe3326`) through a merge of origin/main; its PR targets main. Prerequisites for linked-DN/credit/shortage cases are seeded through API; submit/approve/cancel/error actions use the UI. No broad expected-failure marker or write retry is introduced. Final focused verification: `pnpm exec playwright test tests/sales/fulfillment.spec.ts tests/api/sales-stock.spec.ts --repeat-each=2 --retries=0` passed all 15 executions including setup (seven new cases twice); no retries/skips/expected failures. Full-suite and cleanup results follow below.

### P0.3 final validation

- `pnpm test --retries=0 --reporter=list`: exit 0, **143 passed + 5 existing fixme/skipped = 148 executions**, no retries/expected failures/unexpected failures. The five quarantines remain four Sales/Purchasing PUT cases under api#14 and the item-group race under api#15.
- `pnpm check-types && pnpm lint`: 0 errors / 0 warnings. Seven new cases repeated twice passed all 15 executions including setup. Formatting, whitespace and local Markdown links checked.
- Final `pnpm cleanup:e2e` dry-run: **0 active E2E documents, 0 master-data leftovers, 0 non-cancellable remainders**. Retained cancelled audits: GR 178 / PO 266 / DN 60 / SO 182 / QT 199 = **885 total**; lot/stock-ledger/GL history remains.
- No new app issue: initial failures were test assumptions about VAT, transition-guard precedence and RPC error envelopes, corrected against backend source and confirmed by repeat/full runs. Configured FIFO passed; FEFO and the remaining matrix gaps are not claimed complete. No PR was merged by Codex.

### PR #9 main sync and review nits

- Merged origin/main at `9fe3326` into codex/sales-fulfillment without rebase/force-push; retained the #9 versions for all four conflicts. The PR now targets main and its diff contains Sales fulfillment plus review nits.
- Sales create success dialog has an explicit 30-second timeout. ROADMAP now describes SalesScenario with an injected OwnedSalesStock.
- Dev now implements backend PR #17 (BE-08): the DN shortage regression requires `INSUFFICIENT_STOCK` plus exact product/warehouse/requested/available metadata, keeping HTTP 409/status 409000, exact detail and all no-side-effect assertions. The first resync run's two failures were this intentional contract drift, not new app defects.
- Final affected run: 13 distinct cases repeated twice, **27 passed including setup**, retries=0, no skips/expected failures. Includes all seven #9 cases, three local Sales-create guards and three live QT/SO/DN create cases. Types/lint/formatting pass.
- Cleanup dry-run: 0 active E2E documents, 0 master-data leftovers, 0 non-cancellable remainders. Retained audits: GR 229 / PO 318 / DN 85 / SO 219 / QT 244 = 1095, with lot/ledger history retained.
- The older 12-failure default output manifest belongs to the 20:34 ICT run (six cases repeated twice): mock HTML charset and unnamed-modal locator bugs fixed in #8. Later runs use separate output directories; the final resync manifest is passed with zero failed tests. The explanation and current results are reported in PR #9.

## P1.1 D1/D2 stock operations (2026-11-16)

- [x] DTO factories for all four stock-entry shapes and counted adjustment; create/read/delete contracts + negative qty validation. PUT contracts split out and issue-linked fixme for api#14 after actual POST/GET→PUT 404; no write retries.
- [x] D1 receipt/transfer/issue/repack submit/cancel; quantities by owned product/warehouse, original cost and lot identity, REPACK value in=out and reversal ledger net zero; consumed destination and repeated transition rejections preserve business snapshots.
- [x] D2 below threshold counted→computed delta; above threshold PENDING_APPROVAL has no stock movement; approval re-reads a moved lot and cancellation restores the approval-time baseline. Two opposing lot changes with net zero still require approval based on absolute value per line.
- [x] Changed-lot/repeated-state guards, exact api#18 pending-cancel characterization (not counted as healthy), API list smoke, and cleanup order across D1/D2.
- [x] TARGETS includes stock entries/adjustments. Effective approved/submitted time controls reversal order; masters delete only after stock=0. Owned secondary SKU is retained before POST so partial setup can be cleaned. CLI safety tests run only against localhost and check dry-run, unowned decoys and blocked product deletion after failed reversal.
- [x] PR #9 nit: first GET after Sales newOrder/draft uses bounded read-only toPass (10 seconds); each POST happens once, IDs are tracked before the poll.
- [ ] UI: no D1/D2 routes/containers exist in local frontend or GitHub main. This implementation is API-path coverage and does not invent UI page objects or claim UI CRUD.
- [ ] Permission matrix and frozen-period execution need follow-up/isolated env (dev frozen=null); FEFO, multi-source/rounding permutations and full D1/D2 remain open in matrix.
- [ ] Healthy pending cancellation waits for api#18; PUT update coverage waits for api#14. Cleanup approve→cancel workaround is owned-test-only and is not healthy-flow coverage.

New issue: [api#18](https://github.com/iotechsoft-company/erp-api/issues/18), reproduced 3/3 with new owned records; api#14 occurrence evidence: https://github.com/iotechsoft-company/erp-api/issues/14#issuecomment-6898305304. Final validation is recorded below.

### P1.1 final verification

- Added 28 test definitions: 26 active (including two read-only API smoke and three isolated CLI safety cases), two PUT contracts quarantined under api#14. Exact api#18 characterization runs normally and is not counted as healthy pending cancellation.
- Stock workflows/contracts plus affected Sales fulfillment with `--repeat-each=2 --retries=0`: **61 passed + 4 fixme executions**, including setup. The skips are the two stock PUT cases repeated twice. Separate localhost CLI safety repeat: **7 passed including setup**. No retries/expected-failure markers.
- `pnpm test --retries=0 --reporter=list`: exit 0, **169 passed + 7 existing/issue-linked fixme = 176 executions**. Seven quarantines = six Sales/Purchasing/Stock PUT cases under api#14 plus the item-group race under api#15. No unexpected failure.
- `pnpm check-types && pnpm lint`: 0 errors / 0 warnings. Prettier, whitespace, local Markdown links and public PR redaction checked.
- Final `pnpm cleanup:e2e` dry-run: **0 active E2E documents, 0 master-data leftovers, 0 non-cancellable remainders**. Retained cancelled audits: GR 275 / PO 369 / DN 111 / SO 254 / QT 287 / stock entries 157 / stock adjustments 25 = **1478 total**; lot/ledger history remains.
- Local final logs: `/tmp/qa-stock-repeat.log`, `/tmp/qa-stock-cli.log`, `/tmp/qa-stock-full.log`, `/tmp/qa-stock-cleanup-final.log`. The full-run output manifest is `/tmp/qa-stock-full-results/.last-run.json`; old default-output manifests are not the latest run.

## P1.2 supplier/customer returns (2026-11-16)

- [x] Owned GR/DN prerequisites, DTO factories, draft create/read/delete contracts and read-only list smoke. ReturnScenario reuses PurchasingScenario/OwnedSalesStock; references actual grn_item_id/dn_item_id.
- [x] A4 API partial/full PRN submit/cancel: original lot/cost, stock, PO returned_qty/net status, positive RETURN cancellation ledger and explicit idempotent sync-purchase-order assertion. UI history/search/details read an owned submitted PRN.
- [x] B4 API partial/full and multi-lot SRN: original ISSUE picking order/cost, original lots credited, SO returned_qty/net status, SALES_RETURN ledger/reversal, COGS qty/cost and balanced GL with per-account net balances. Full return removes COGS and reopens SO; cancellation restores it. Profit/revenue/VAT/refund are not asserted.
- [x] Exact over-return create/submit checks (including competing drafts), DRAFT/CANCELLED source rejection, duplicate lines/qty/reason DTO validation, repeat submit, consumed original/returned stock and DRAFT/SUBMITTED SRN→DN cancellation guards. Rejected writes retain document/stock/lot/ledger/COGS snapshots.
- [x] Cleanup reverses consumer stock entries→SRN→DN and PRN→GR→PO before stock-zero master deletion. Local CLI graph regressions cover both chains and a blocked SRN retaining its product while an independent chain cleans successfully. Cancelled audits retained.
- [x] PR #10 nits: catch/report unsupported stock cleanup status while continuing safe resources; document cross-service stale PO SENT/APPROVED api#14 variant without write retries.
- [ ] Healthy PRN create/zero-qty UI blocked by frontend#14. Active characterization verifies SUBMITTED GR + RECEIVED PO and absent action. UI edit/delete/cancel controls absent; SRN receive-return page absent in frontend source.
- [ ] PRN/SRN PUT both issue-linked fixme under api#14 after POST/GET→PUT 404; PRN failed after four passing attempts, SRN failed in first contract run. Create/read/delete and transitions remain active. Evidence: [SRN](https://github.com/iotechsoft-company/erp-api/issues/14#issuecomment-6904828962), [PRN](https://github.com/iotechsoft-company/erp-api/issues/14#issuecomment-6904986528).
- [ ] Bundle returns, multi-UOM/line/warehouse, frozen periods, permissions, failed PO sync recovery and downstream AP/CN/refund/report reconciliation. Shared settings stay read-only; A4/B4 remain partial workflows.

### P1.2 validation notes

An earlier repeat run was interrupted by a BASE_URL DNS outage after 29 passing executions. Read-only health recovered, then state-based cleanup reversed the orphaned owned DN/GR chain and returned to 0 active records; no writes retried. Other initial failures were test assumptions corrected against source/wire evidence (ledger type, exact RPC code, persisted pick order). Final clean-run results follow below.

### P1.2 final verification

- Added 28 test definitions: 25 active and 3 issue-linked fixme (PRN/SRN PUT + blocked UI create). Existing tests remain active except prior quarantines; no broad expected-failure markers.
- `pnpm check-types && pnpm lint`: exit 0, no errors/warnings; Prettier, whitespace, local doc links and public redaction checks clean.
- `pnpm exec playwright test tests/returns tests/api/return-factories.spec.ts tests/api/return-cleanup-cli.spec.ts tests/api/stock-cleanup-cli.spec.ts --repeat-each=2 --retries=0`: **57 passed + 6 fixme executions**, 63 total including setup, no unexpected failures (5.8m).
- `pnpm test --retries=0 --reporter=list`: **194 passed + 10 fixme = 204 executions**, no retries or unexpected failures (12.0m). Quarantines: 8 PUT cases under api#14, one race under api#15, one blocked PRN UI flow under frontend#14. Bug characterizations count as active tests, not healthy coverage.
- `pnpm cleanup:e2e` dry-run: **0 active documents / 0 master leftovers / 0 non-cancellable remainders / 0 unknown stock statuses**. Cancelled audits retained: stock entries 239, adjustments 37, SRN 37, DN 201, PRN 29, GR 471, PO 582, SO 353, QT 390 = **2339 audits**. Stock/lot/ledger history remains.
- Local final evidence: `/tmp/qa-returns-validation.log`, `/tmp/qa-returns-full.log`, `/tmp/qa-returns-cleanup-final.log`. Both output manifests (`/tmp/qa-returns-validation-results/.last-run.json`, `/tmp/qa-returns-full-results/.last-run.json`) report passed with no failed tests. Older interrupted run artifacts are not the final result.

## P1.3 finance documents (2026-11-16)

- [x] DTO factories + API create/read/delete contracts for AP vendor bills and receipts. FinanceScenario composes owned ReturnScenario GR/DN sources, snapshots shared VAT/account references read-only and reverses finance children before sources/masters.
- [x] A5 vendor bill→submit→PRN→vendor CREDIT_NOTE→cancel child→cancel bill: original GR item/supplier/qty/cost match, original VAT, owned supplier net aging, stock remains at the PRN-adjusted quantity after finance reversals, GL role/direction/balance/reversal and bill/GR cancellation dependency guards.
- [x] C1 full tax invoice→C2 CN/DN→void: actual DN items, reference/reason, original VAT/inclusion, AR net aging and balanced account-role GL/reversal. Draft has no number or GL; issued number remains after void. Additional C1 RECEIPT/INVOICE/PROFORMA/INV_TAX/ABB variants test type-specific VAT/GL; RECEIPT and PROFORMA intentionally post no GL.
- [x] Independent qty/discount/VAT/totals assertions for none/header/per_item/both; wire money is numeric(18,4), not the 2-decimal display convention. Standard VAT product only; no claim for mixed-rate/multi-line allocation or changed tax-rate snapshots.
- [x] Exact over-invoice create + submit/issue rechecks after competing drafts, DRAFT source rejection, duplicate/zero qty, supplier mismatch/current read-only price tolerance, repeat posting/reversal, missing AP/receipt CN references/reason, vendor CN without actual PRN/exceeding bill, excessive receipt CN and draft CN issue after original void. Rejections retain business/ledger snapshots.
- [x] CLI targets receipts and AP invoices before returns/stock sources; sort adjustments before originals independent of list order; void with void_reason, retain VOID/CANCELLED audit documents. Localhost regression validates ordering, ownership/dry-run and PR #11 nit: retained PRN/SRN print linked GR/DN IDs instead of linked SO.
- [ ] Frontend local + GitHub main have no AP/receipt/CN/DN document pages/containers; this is API-path coverage, no invented UI/POM or full UI claim.
- [ ] Both Finance PUT contracts are quarantined under api#14: receipt 2/4 failed; AP was kept active through nine passing attempts, then failed on the tenth (POST/GET→PUT 404). Create/read/delete and transitions remain active; no write retries. [Receipt evidence](https://github.com/iotechsoft-company/erp-api/issues/14#issuecomment-6919581988), [AP evidence](https://github.com/iotechsoft-company/erp-api/issues/14#issuecomment-6921624573).
- [ ] Permissions, frozen/period guards, multi-GR/product/UOM, mixed VAT/exempt/zero-rated, percent/header pro-rata variants, WHT/FX, vendor abbreviations, tax identity variants/printing, receipt issue after a linked DN is cancelled while the receipt is DRAFT, downstream billing/payments/refund guards and concurrent issue/submit stress. P1.4 below adds downstream billing/payment/credit/refund guards and FX/WHT; remaining P1.3 variants stay open. Do not change shared settings to reach them.

### P1.3 validation notes

Initial AP/AR lifecycle and guard runs passed. Receipt PUT failure was triaged to existing api#14 and only its update contract quarantined. Initial totals assertions incorrectly assumed 2 decimal places; source `libs/common/src/utils/discount.util.ts` declares 4-decimal money (`numeric(18,4)`), matching wire data. Tests now compute independently at that precision rather than rounding away differences. Final verification follows below.

The first complete P1.3 full-suite attempt finished **219 passed / 11 fixme / 1 failed** (17.9m). The failure was an existing Sales partial/full shipment spec exceeding its unchanged 60-second test budget while repeatedly traversing the all-status DN list containing retained cancelled audits; the failure snapshot already showed a successful DN cancellation. State-based recovery removed its two remaining zero-stock owned masters (supplier/product), returning to 0 active/masters.

A separate Sales prerequisite commit scopes real UI pagination to DRAFT for submit and SUBMITTED for cancel, and waits for the filtered API body to match the displayed identity column. All stock/lot/COGS/profit/GL/reversal assertions remain. No timeout increase, request rewriting, write retries or broad failure marker was added. Final stability/full-run evidence is recorded below; local traces stay outside the public repo.

Sales stability proof after the scoped-filter fix: **0/10 failures**, 11 passed including setup (3.8m), retries=0, local traces recorded; mutations stay serial as required by repo isolation (no concurrent worker override). Affected Sales lists `--repeat-each=2`: **19 passed** including setup (8.9s). A passing trace shows DN list requests only on page 1 under ALL/DRAFT/SUBMITTED filters. The earlier full-suite timeout remains recorded above; final full-suite results are separate.

The second full attempt finished **218 passed / 11 fixme / 2 failed** (19.3m): the partial/full case passed at 23.6s, but the existing credit-hold and order lifecycle cases still traversed their all-status histories and hit 60s. Their snapshots showed ALL filters and historical rows (DN row 281; SO row 61). Cleanup reported interrupted owned GR/PO/SO/QT/master chains; dependency-ordered CLI recovery returned to 0 active/masters before fresh validation.

Commit `36bb7f4` applies current-state filters to all fulfillment and order transition lookups (QT draft/sent/approved, SO pending/confirmed/cancelled, DN draft/pending/submitted), retaining the original UI actions/assertions and timeout. The earlier two full attempts are not final green evidence. Credit stability and whole-Sales repeat results follow below.

Credit-hold stability after the complete state-filter change: **0/10 failures**, 11 passed including setup (3.0m), individual business-test durations 14.7–20.6s; serial isolation and retries=0 retained. Whole affected Sales repeat/full verification follows separately.

Complete affected Sales verification after `36bb7f4`: `tests/sales/fulfillment.spec.ts`, `orders.spec.ts`, `lists.spec.ts` with `--repeat-each=2 --retries=0`: **35 passed**, no skipped or unexpected failures (4.6m), including setup. Order lifecycle passed at 17.8s and 16.2s. This validates every changed caller and the shared filtered-response barrier; the final full suite below starts fresh from this code.

The third full attempt finished **219 passed / 11 fixme / 1 failed** (14.7m). All Sales cases passed (partial/full 18.1s, credit hold 14.3s, order lifecycle 20.8s), but AP draft PUT returned exact api#14 404 after POST/GET. Across the recorded AP update attempts: 9 passed / 1 failed. Cleanup afterwards reported 0 active/masters without recovery writes. After this observed occurrence, AP update joins receipt update as an issue-linked fixme; no other contract/workflow was disabled. Fresh contract repeats and final full validation follow below.

### P1.3 final verification

- Added **27 test definitions: 25 active / 2 issue-linked fixme** (Finance AP/receipt PUT only). Current full suite: **219 passed + 12 fixme = 231 executions** (17.6m), retries=0, no unexpected failures. The 12 quarantines are ten api#14 PUT cases, one api#15 race and one frontend#14 blocked PRN UI flow. Passing bug signatures are not healthy workflow coverage.
- Finance + affected cleanup repeat-each=2 before the later AP404 occurrence: **69 passed / 2 receipt fixme executions** (71 total including setup, 7.8m). After AP also failed and was quarantined, Finance contract repeat-each=2: **5 passed / 4 fixme executions** (37.4s); both live create/read/delete contracts remain active.
- Sales prerequisite fixes: partial/full stability **0/10 failures** (11 passed including setup, 3.8m); credit stability **0/10** (11 passed, 3.0m); all changed Sales fulfillment/orders/lists repeat-each=2 **35 passed** (4.6m). Original timeout is unchanged; no request rewrite or write retry.
- `pnpm check-types && pnpm lint`: clean, 0 errors/warnings. Prettier, whitespace, local Markdown links and public redaction checked.
- Final `pnpm cleanup:e2e` dry-run: **0 active documents / 0 masters / 0 non-cancellable remainders / 0 unknown stock statuses**. **4284 cancelled/void audits retained** across 11 document resources; stock/lot/ledger history remains. Audit counts: receipts 115 / ap-invoices 68 / stock-entries 385 / stock-adjustments 61 / sales-returns 67 / delivery-notes 428 / purchase-returns 57 / goods-receipts 863 / purchase-orders 1007 / sales-orders 592 / quotations 641.
- Final local evidence: `/tmp/qa-finance-full-clean.log`, `/tmp/qa-finance-full-clean-results/.last-run.json` (passed, empty failedTests), `/tmp/qa-finance-cleanup-final.log`, `/tmp/qa-finance-contracts-final.log`, `/tmp/qa-finance-repeat.log`, `/tmp/qa-finance-sales-stability.log`, `/tmp/qa-finance-credit-stability.log`, `/tmp/qa-finance-sales-all.log`. Earlier full/verified/final-named logs are historical failed attempts, not the latest result. Local traces and raw logs are not public artifacts.

## P1.4 finance settlements (2026-11-17)

- [x] Factories/API contracts: billing-notes, payment-entries, customer/supplier credit-applications and refunds; owned draft create/read/delete, billing/payment PATCH. Credit/refund have no update endpoint. Initial GET only is bounded; writes occur once.
- [x] C3 billing aggregates two owned invoices; issue re-reads payment-adjusted outstanding; cancel releases source void guard. Draft/issued billing makes no GL. Exact duplicate/draft/wrong-party/settled/voided/repeat-state rejections preserve snapshots.
- [x] C4 RECEIVE/PAY partial→full plus allocated overpayment→unallocated credit; independent GL roles/directions/balance/reversal, owned-party debt/credit/net_total and unchanged physical stock. USD booked at 35 settled at 34/36 covers realised gain/loss both directions; WHT uses a current read-only tax-config reference and asserts gross debt settlement with separate cash/tax accounts. Wrong party/currency, over-debt/WHT and stale draft submit rechecks preserve state.
- [x] C5 draft + issued receipt nested schedule replace/read/delete, empty/zero/invalid-date DTO validation and exact sum rejection without replacement, client sequence/due dates/overdue flag, head-first payment and tail-first CN allocation, VOID rejection. Aging is header due-date based; it is not repartitioned by instalment dates.
- [x] C10 customer and supplier advance/overpayment plus CN-surplus source → application/refund → cancel; balance/ledger reversal, source-cancel dependency, insufficient credit/target debt, wrong party, source XOR, empty lines and authoritative competing refund checks.
- [x] Cleanup CLI six new document targets before AP/AR/stock sources; owned schedule marker discovery, including VOID parents; retained audits separate from active records. Localhost graph verifies dependency order/dry-run/foreign ownership/continued independent cleanup after a blocked refund.
- [x] PR #12 nits: FinanceScenario per-account zero-net convergence uses bounded read-only toPass after one cancel/void; secondary supplier documents are cleaned before deleting that supplier. Local delayed-ledger regression proves multiple reads without repeating writes and excludes other-party documents.
- [ ] UI/POM: none exists for these workflows in local source or GitHub frontend main; API-path is explicit, no invented routes.
- [ ] Remaining variants: permissions/frozen periods/printing and certificates, multi-invoice FX/WHT split, multi-source/duplicate-source credit aggregation, interdependent application chains/CN void guards, credit-application instalment settlement and full aging date/as-of matrix. No shared setting writes. Existing api#14 quarantines unchanged; no new app bug confirmed.

### P1.4 final verification

- Added **39 active test definitions**: 30 settlement workflow/smoke, 4 factory contracts, 3 CLI safety, 1 Finance cleanup nit and 1 collection-consistency regression. **No new quarantine**.
- Fresh `pnpm test --retries=0 --reporter=list`: **258 passed / 12 existing fixme = 270 executions** including setup (18.9m), no unexpected failures. Manifest: passed / empty failedTests. Existing quarantines remain ten api#14 PUT cases, api#15 item-group race and frontend#14 PRN UI creation.
- Final settlement callers/contracts/CLI/consistency regression `--repeat-each=2 --retries=0`: **75 passed** (9.2m). Additional draft schedule factory/empty-zero-date contracts repeat-each=2: **3 passed** including setup (22.1s). PR #12 Finance/nit affected repeat evidence: **119 passed / 4 existing Finance PUT fixme executions** (14.6m); supplementary FX/WHT/party/CLI proof: **25 passed** (3.1m).
- Stability after read barrier: **0/10 failures** in the original AR guard, plus ten delayed-collection regression executions; **21 passed including setup** (2.1m), retries=0. Mutation worker remains 1; traces stay local. No write retry or timeout increase.
- `pnpm check-types && pnpm lint`: 0 errors/warnings. Formatting, whitespace, local Markdown links and public secret/domain redaction checked.
- Final `pnpm cleanup:e2e` dry-run: **0 active documents / 0 masters / 0 schedule children / 0 non-cancellable remainders / 0 unknown stock statuses**. **6764 cancelled/void audits retained** across 17 document resources, plus historical stock/lot/ledger records. This is zero active data, not zero historical rows.
- Final local evidence: `/tmp/qa-settle-full-final.log`, `/tmp/qa-settle-full-final-results/.last-run.json`, `/tmp/qa-settle-cleanup-final.log`, `/tmp/qa-settle-final-repeat.log`, `/tmp/qa-settle-schedule-contract.log`, `/tmp/qa-settle-stale-proof.log`. Raw logs/traces are not public artifacts.

### P1.4 validation notes

The first full attempt finished **255 passed / 12 existing fixme / 1 failed** (268 executions, 19.6m). The AR stale-draft guard captured a collection header still DRAFT after submit acknowledged SUBMITTED and aging/GL already reflected the payment; the later read was SUBMITTED. The unchanged case passed **3/3 isolated repeats** with local traces. Triage/flaky-hunter/report-bug classified this as missing test read-consistency synchronization, not a new confirmed app defect; no duplicate issue was filed.

SettlementScenario now tracks acknowledged transition statuses and bounds read-only collection convergence before snapshots/cleanup. The delayed-collection regression proves three reads after one POST; persistent incorrect states still fail. No write retry, broad failure marker, weakened rejection assertion or new quarantine was added. The first failed attempt also cleaned to 0 active/masters/children, retaining 5840 audits, but is not final green evidence. Final fresh verification is above.

## BE-14 delivery-invoice migration (2026-11-19)

P1.5 work is saved on `codex/cancellation-permissions`. On resume, dev returned HTTP409 / `DELIVERY_NOTE_ALREADY_INVOICED` to its old manual DN-linked invoice setup. Current backend source and refreshed OpenAPI confirm the intended BE-14 contract: submitting/approving a DN issues a FULL_TAX_INVOICE automatically; there is no per-document opt-out. The user chose a **separate migration PR first**, based on main, before resuming P1.5. No shared sales/stock settings were changed and no app bug was filed for this intended change.

- [x] `FinanceScenario` discovers the automatic invoice by the actual owned DN ID, verifies automatic flag/customer/E2E source marker and actual DN item IDs, and supports retaining it for linked workflow assertions.
- [x] Default manual-document fixtures void only their owned automatic invoice and wait for each GL account and owned AR balance to return to zero. Subsequent manual receipt/discount/FX/WHT/schedule fixtures are explicitly **standalone**, with no DN header/item references. This does not count as duplicate billing of a DN or as auto-invoice/payment integration coverage.
- [x] C1 linked lifecycle now uses the invoice actually issued by DN submission. New API cases assert source/totals/GL/AR, DN cancel→invoice VOID→stock/COGS/GL/AR reversal, and exact duplicate rejection both before and after invoice void. The obsolete AR competing DN-invoice draft case is replaced; AP quantity/competing-draft guards remain active.
- [x] Existing DN cancellation/draft-control lookups use real DRAFT/CANCELLED status filters before pagination; no request rewriting or higher timeout.
- [x] Affected repeat/full-suite verification completed on 2026-11-19; final cleanup and static checks rechecked on 2026-11-21. Results below supersede historical module runs.
- [ ] After this migration is reviewed/merged, merge `origin/main` into the P1.5 branch (no rebase/force-push), adapt its AR chain to the automatic invoice, revisit the old api#30 setup and revalidate the shared table/page-size performance changes. P1.5 has not been published as a PR and is not merge-ready. Do not start P2.1 as part of this migration.

Initial migration contracts `--repeat-each=2 --retries=0`: **7 passed including setup** (1.2m), covering automatic lifecycle/duplicate guards and standalone AR factory. Required typecheck/lint are clean. The original P1.5 api#30 draft-issue reproduction cannot be seeded through today's create path because the DN is already invoiced; this is not proof that historical stored drafts are safe, and the app issue is not closed by this migration.

### BE-14 migration verification

- Affected Finance/settlement callers, factories and cleanup/consistency regressions `--repeat-each=2 --retries=0 --workers=2`: **119 passed / 4 existing Finance PUT fixme executions**, 123 total including setup (16.7m).
- Shared-table DOM regression repeat2: **3 passed** (3.4s); real Inventory/party/Sales list callers repeat2: **57 passed** (34.4s); changed DN spec repeat2: **7 passed** (1.2m). Mutation project remains one worker; no timeout increase/write retry/request rewrite.
- Four definitions added (two automatic-invoice cases, one row-scoped table regression and one exact bundle-lookup characterization), one obsolete AR DN-invoice-draft path retired: **net +3**, complete inventory **273 executions**. The original 12 quarantines remain; frontend#44 adds one blocked owned-bundle UI quarantine. Typecheck/lint: 0 errors/warnings.
- Final full suite (2026-11-19): `pnpm test --workers=2 --retries=0 --reporter=list` **260 passed / 13 issue-linked fixme = 273 executions** (20.6m), zero failed tests; output manifest status=passed. Mutation project remains serial. Latest deployed UI/item-group/inventory revalidation repeat2: **17 passed / 2 bundle fixme executions** (3.2m).
- Post-suite cleanup on 2026-11-19: **0 active / 0 masters / 0 children / 0 non-cancellable / 0 unknown / 0 failures**, 10,419 cancelled/void audits retained. Final fresh dry-run on 2026-11-21 again reports all those remainder/error counts zero; it currently lists **0 audit rows**, so the older audit count is historical, not today's state. No API writes are made by either dry-run.
- `pnpm check-types && pnpm lint` rechecked 2026-11-21: 0 errors/warnings; formatting, whitespace, local documentation links and public-content redaction checked. Full/repeat test evidence is from 2026-11-19, not a new full-suite run on 2026-11-21.
- When resolving the saved P1.5 overlap after merge, keep this migration's row-scoped table read/DOM contract rather than its earlier flattened-cell prototype, then revalidate P1.5's QT page-size path.

### Deployed UI/baseline refresh in the migration

The first full migration attempt completed **254 passed / 12 existing fixme / 6 failed** (272 executions, 21.0m). Triage found: one obsolete api#13 expected400 (now healthy201), one real bundle lookup defect, and four DN callers waiting for POST before the new BE-14 confirmation dialog was confirmed. These are recorded separately from the final fresh run.

- api#13 now has healthy201 + bounded detail-read assertions for root parent=null/name/leaf, verified **0/10 failures**,11 passed including setup (13.1s); GitHub issue remains open, no automatic closure.
- DN submit/approve and negative guards now confirm the actual translated dialog and DN number, then observe the correct request. Initial revalidation exposed one stale gross-as-revenue assertion: the owned UI SO carries is_vat_included=true, vat_rate7, total150, net140.1869. Expected net/VAT/total/profit are now independently calculated at4-decimal precision from the known input and immutable order context. Cost/lot/GL/reversal assertions remain.
- [frontend#44](https://github.com/iotechsoft-company/erp-frontend/issues/44) is source/trace verified: UI loads100 of2662 candidates and cannot search beyond them. Healthy visibility checks failed **3/3**, snapshots retain No options after the web-first assertion timeout; positive exact characterization passed3/3 and final repeat2 **3 passed including setup** (4.5s). Read-only reproduction uses a valid non-E2E product from a later API page and never saves the form or changes stock. Only the blocked owned bundle CRUD is quarantined; single CRUD/list/Thai validation stay active.
- Total change versus baseline: four definitions added (auto-invoice2, shared DOM1, lookup characterization1), one obsolete AR draft path retired, one existing bundle flow quarantined. Inventory **273 executions**, with **13 issue-linked quarantines** (original12 + frontend#44). Passing a bug signature is not healthy bundle coverage. No broad expected failure or write retry.

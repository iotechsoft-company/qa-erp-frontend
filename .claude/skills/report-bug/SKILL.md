---
name: report-bug
description: File a GitHub issue to iotechsoft-company/erp-api or iotechsoft-company/erp-frontend when an E2E test uncovers a real application bug (wrong API response, 5xx, broken UI, contract drift, wrong Thai text). Use after a test failure has been triaged as an app bug, not a test bug — or when the user says "แจ้ง issue", "report bug", "เปิด issue ให้ทีม api/frontend". Handles triage, routing, dedupe, redaction, and linking the issue back into the spec.
---

# Report bug found by E2E → GitHub issue

The QA suite targets the **dev** env (`BASE_URL` in `.env`). When a failure is a defect in the app, file it
with `gh` to the repo that owns the defect. The user has pre-approved filing issues; don't ask before filing,
but do the checks below. Tell the user each issue URL you created.

| Repo | Owns |
|---|---|
| `iotechsoft-company/erp-api` | NestJS backend: status codes, response body/DTO, validation messages from API, permissions (403), data/stock logic, 5xx |
| `iotechsoft-company/erp-frontend` | Next.js UI: rendering, navigation/redirects, client-side validation, Thai/EN text from `translation/`, request the UI sends, how it shows API errors |

## 1. Triage — is it really an app bug?

Run the failing test again first: `pnpm exec playwright test <file> -g "<title>" --repeat-each=3`.
- Passes sometimes → **flaky test**, fix the test (locator/wait), do NOT file.
- Fails because a locator/text changed but the feature works for a human → **test bug**, update the page object, do NOT file.
- Data left from another run / missing reference data → fix setup or `pnpm cleanup:e2e`, do NOT file.

Open the trace (`pnpm exec playwright show-trace test-results/<dir>/trace.zip`) or read
`test-results/<dir>/error-context.md`, then route:

1. **Reproduce at the API layer** through the app's proxy (never the API domain):
   ```bash
   set -a; . ./.env; set +a
   TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/v1/auth/login" -H 'Content-Type: application/json' \
     -d "{\"username\":\"$E2E_USERNAME\",\"password\":\"$E2E_PASSWORD\"}" | python3 -c 'import sys,json;j=json.load(sys.stdin);print((j.get("data",{}).get("attributes") or j)["access_token"])')
   curl -s -i "$BASE_URL/api/<prefix>/v1/<resource>" -H "Authorization: Bearer $TOKEN"
   ```
2. Compare with the spec in `.openapi/<prefix>.json` (`pnpm fetch:openapi` if missing).
   - API returns wrong status/body vs spec, 5xx, wrong data → **erp-api**
   - API is correct but UI shows/does the wrong thing, or UI sends a wrong request vs the spec → **erp-frontend**
   - Spec itself is ambiguous → file to **erp-api** with label `question`
3. When unsure, look at the source: `/Users/PEEPO/Project/nextjs/erp-frontend` (frontend), or
   `gh api repos/iotechsoft-company/erp-api/contents/<path>` (backend). A wrong route is worse than a slow one.

## 2. Dedupe

Each issue carries a stable key: `<repo-side>:<method or page>:<path>:<symptom>`, e.g.
`api:POST:/sales-bc/v1/customers:500-on-null-alias` or `fe:/products:table-empty-after-create`.

```bash
REPO=iotechsoft-company/erp-api   # or erp-frontend
KEY='api:POST:/sales-bc/v1/customers:500-on-null-alias'
gh issue list -R $REPO -s open -l qa-e2e --search "\"qa-e2e key=$KEY\" in:body" --json number,url
```
If one exists → add a comment with the new occurrence (date, commit, run link) instead of a new issue:
`gh issue comment <n> -R $REPO --body-file <file>`.

## 3. Write the body (Thai, same style as existing erp-api issues)

Write it to the scratchpad, never into the repo. Template:

~~~markdown
<!-- qa-e2e key=<KEY> -->
> filed by qa-erp-frontend E2E via Claude Code
> env: dev · found <YYYY-MM-DD>
> test: https://github.com/iotechsoft-company/qa-erp-frontend/blob/<qa-commit-sha>/<spec-path>#L<line>
> CI run: <url, if found in CI>

**สรุป:** <หนึ่งประโยค — อะไรพัง ที่ไหน>

**ขั้นตอนทำซ้ำ**
1. login เป็น user ที่มี role <ROLE_SUPERADMIN / ROLE_STAFF>
2. ...

**คาดหวัง:** <ตาม spec / ตาม UC — อ้าง OpenAPI path หรือไฟล์ translation ถ้ามี>
**เกิดจริง:** <status + body ย่อ / สิ่งที่หน้าจอแสดง>

<details><summary>Request / Response</summary>

```http
POST /api/sales-bc/v1/customers
Content-Type: application/json

{ ...payload (ตัดค่าที่ไม่เกี่ยว) }

HTTP/1.1 500
{ ...response }
```
</details>

**ข้อมูลประกอบ:** <OpenAPI schema ที่เกี่ยวข้อง / ไฟล์ใน repo ที่น่าจะเป็นต้นเหตุ ถ้ารู้>
~~~

Rules for the body:
- **Redact** before posting: no passwords, `access_token`/`refresh_token`/`csrf_token`, cookies, `Authorization`
  headers. Show the API as `/api/<prefix>/v1/...` — **never the API domain** (erp-frontend forbids it anywhere).
  Usernames `e2e.admin` / `e2e.staff` are fine.
- Run the check below; it must print `clean`:
  ```bash
  BODY=<scratchpad>/issue.md
  for k in E2E_PASSWORD E2E_STAFF_PASSWORD ADMIN_PASSWORD; do v=$(grep "^$k=" .env | cut -d= -f2-); [ -n "$v" ] && grep -qF "$v" "$BODY" && echo "LEAK $k"; done
  grep -qiE 'bearer [a-z0-9._-]{20,}|eyJ[a-zA-Z0-9_-]{10,}|erp-api\.' "$BODY" && echo "LEAK token/domain" || echo clean
  ```
- Screenshots: `gh` can't attach images. Link the CI run (Playwright report artifact) instead; locally,
  describe what's on screen and paste the relevant `error-context.md` page snapshot lines.
- No `@mentions` of people.

## 4. File it

```bash
gh label create qa-e2e -R $REPO --color D93F0B --description "Found by qa-erp-frontend E2E suite" 2>/dev/null || true
gh issue create -R $REPO \
  --title "[E2E] <สั้น ชัด: อะไร + ที่ไหน>" \
  --label bug --label qa-e2e \
  --body-file "$BODY"
```
Title examples: `[E2E] POST /sales-bc/v1/customers คืน 500 เมื่อไม่ส่ง alias`,
`[E2E] หน้า /products ไม่แสดงสินค้าที่เพิ่งสร้างจนกว่าจะ refresh`.

## 5. Link it back into the test

So the suite stays green while the bug is open and alerts us when it's fixed:

```ts
test('สร้างลูกค้าโดยไม่ระบุ alias', {
  annotation: { type: 'issue', description: 'https://github.com/iotechsoft-company/erp-api/issues/<n>' },
}, async ({ api }) => {
  test.fail(true, 'known bug erp-api#<n>') // flips to "unexpected pass" when fixed → then remove
  ...
})
```
Use `test.fail` (not `skip`/`fixme`) when the test still runs to completion; use `test.fixme` only if the bug
blocks the test from running at all (e.g. page crashes, would leave data behind).
Also add one line under `## Known app bugs` in `docs/ROADMAP.md`: `- erp-api#<n> — <title>`.

## 6. Report to the user

List each issue: repo#number, title, URL, and whether it was new or a comment on an existing one.

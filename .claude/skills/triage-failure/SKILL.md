---
name: triage-failure
description: Diagnose failing Playwright tests in qa-erp-frontend (local run or GitHub Actions run) and classify each failure as flaky, test bug, test-data/env problem, or real app bug — then fix it or hand it to report-bug. Use when tests fail, CI is red, or the user says "เทส fail", "CI แดง", "ดูให้หน่อยว่าทำไมพัง", "triage".
---

# Triage failing E2E tests

Goal: for every failing test, one verdict + one action. Never "fix" an app bug by weakening the test.

## 1. Collect failures

**Local** — re-run only what failed, with traces:
```bash
pnpm exec playwright test --last-failed --trace=on --reporter=list
```
**CI** — pull the report of a run:
```bash
gh run list -R iotechsoft-company/qa-erp-frontend -w e2e.yml -L 5
gh run view <run-id> -R iotechsoft-company/qa-erp-frontend --log-failed | tail -100
gh run download <run-id> -R iotechsoft-company/qa-erp-frontend -n playwright-report -D <scratchpad>/report-<run-id>
```

Per failure, read in this order (cheapest first):
1. `test-results/<test-dir>/error-context.md` — the error + an ARIA snapshot of the page at failure time
2. the screenshot `test-failed-1.png` (Read tool shows images)
3. the trace, only if still unclear: `pnpm exec playwright show-trace test-results/<test-dir>/trace.zip`
   (network tab: look for 4xx/5xx under `/api/`)

## 2. Classify

| Verdict | Signals | Action |
|---|---|---|
| **Flaky** | passes on `--repeat-each=5` sometimes; timeout on an element that exists in the snapshot; failure only under parallel workers | run the `flaky-hunter` skill |
| **Test bug — locator/text drift** | element is in the snapshot under a different name/role; Thai text changed in `erp-frontend/packages/*/translation/th/*.json` (`git -C /Users/PEEPO/Project/nextjs/erp-frontend log -p -- '**/translation/th/*.json'`) | update the page object (not the spec), re-run |
| **Test bug — wrong expectation** | the app's behavior matches the SRS/OpenAPI but the assertion doesn't | fix the assertion; cite the source (`.openapi/<bc>.json` path or SRS UC) in a comment |
| **Test data / env** | 409 duplicate, "not found" for reference data, leftover `E2E-` rows, 401 after password rotation, dev server down/deploying (502/503 for all routes) | `pnpm cleanup:e2e --apply`, `pnpm provision:users` (then update GitHub secrets), or re-run later; make setup create its own data |
| **App bug** | API returns status/body that contradicts `.openapi/`, any 5xx, UI shows wrong data although API is right, JS `pageerror` | **run the `report-bug` skill**, then mark the test `test.fail()` with the issue link |

Rules:
- Decide with evidence (response body, snapshot line, spec reference) — quote it in your summary.
- If the same root cause hits many tests (e.g. login broken → everything fails), triage the root once.
- `.auth/user.json` is stale/expired → `pnpm auth` regenerates it.
- The suite targets shared **dev**: other people's data and deploys can change under you. Check
  `curl -s -o /dev/null -w '%{http_code}' $BASE_URL/login` before blaming the app.

## 3. Verify the fix

```bash
pnpm exec playwright test <file> -g "<title>" --repeat-each=3
pnpm check-types && pnpm lint
pnpm cleanup:e2e        # dry-run must show 0 leftover records
```

## 4. Report

A table: test · verdict · evidence (one line) · action taken (file changed / issue URL / re-run result).

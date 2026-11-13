---
name: flaky-hunter
description: Find and fix flaky Playwright tests in qa-erp-frontend by running them repeatedly, measuring failure rates, comparing passing vs failing traces, and applying deterministic fixes (never timeouts). Use when a test passes sometimes, CI fails then passes on retry, or the user says "flaky", "เทสไม่นิ่ง", "บางทีผ่านบางทีไม่ผ่าน".
---

# Hunt flaky tests

## 1. Measure

```bash
OUT=<scratchpad>/flaky.json
pnpm exec playwright test <file-or-dir> --repeat-each=10 --workers=4 --retries=0 --reporter=json > "$OUT"
python3 - "$OUT" <<'PY'
import json, sys, collections
r = json.load(open(sys.argv[1])); stats = collections.defaultdict(lambda: [0, 0])
def walk(s):
    for sp in s.get('specs', []):
        for t in sp['tests']:
            for res in t['results']:
                k = f"{sp['file']}:{sp['line']} {sp['title']}"; stats[k][1] += 1
                if res['status'] not in ('passed', 'skipped'): stats[k][0] += 1
    for c in s.get('suites', []): walk(c)
for s in r['suites']: walk(s)
for k, (f, n) in sorted(stats.items(), key=lambda x: -x[1][0]):
    if f: print(f"{f}/{n} failed  {k}")
PY
```
Also try `--workers=1`: fails only in parallel → shared-state problem; fails also serially → timing problem.
CI flakes: `gh run list ... --json conclusion,attempt` and look for runs passing on attempt 2.

## 2. Compare a passing and a failing run

`--trace=on`, then open one passing and one failing trace side by side. Look at: the action right before the
failure, network calls still pending, what the DOM snapshot showed vs what the locator expected.

## 3. Known flake causes in this app → deterministic fix

| Cause | Fix |
|---|---|
| React Query refetch re-renders the table after the assertion grabbed a row | assert on the final state with web-first `expect(locator).toHaveText/...`; wait for the specific response: `page.waitForResponse(r => r.url().includes('/api/...') && r.ok())` started **before** the click |
| `nuqs` URL state updates async after typing in search/filter | `await expect(page).toHaveURL(/[?&]s=/)` before reading results |
| MUI Dialog/Menu/Snackbar enter-exit transitions | wait for `toBeVisible()` / `toBeHidden()` of the dialog itself; never click during animation with `force` |
| MUI Autocomplete options load async | type, then `await expect(page.getByRole('option', { name })).toBeVisible()` before click |
| Parallel tests on shared dev data (same list, counts, "first row") | each test creates its own `E2E-` data and filters to it; never assert on totals or row index of shared lists |
| Unique-constraint collisions | use factories (`e2eCode()` has timestamp + random) — no hand-written codes |
| Access token expires mid-suite | `pnpm auth`; setup runs once per invocation — keep total run < token TTL or re-login in the fixture |
| Dev server deploying during run (sudden 502 across tests) | not a flake in our code — re-run; mention in report |

Forbidden "fixes": `waitForTimeout`, `networkidle`, raising global timeouts, `force: true`, adding retries
to hide it. If a real fix isn't possible now: `test.fixme(...)` + `annotation: { type: 'flaky', description: '<cause>' }`
and a line in `docs/ROADMAP.md`.

## 4. Prove it

Re-run step 1 on the same tests: **0/10** failures with `--workers=4`, then `pnpm check-types && pnpm lint`.
Report: test · before rate · cause · fix · after rate.

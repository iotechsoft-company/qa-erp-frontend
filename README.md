# qa-erp-frontend

E2E automation tests for [erp-frontend](../../nextjs/erp-frontend) — **Playwright + TypeScript**.

## Quick start

```bash
pnpm install
pnpm install:browsers
cp .env.example .env   # fill in E2E_USERNAME / E2E_PASSWORD
pnpm test:smoke
pnpm report            # open HTML report
```

## Scripts

| Command                          | Description                                |
| -------------------------------- | ------------------------------------------ |
| `pnpm test`                      | Run all tests                              |
| `pnpm test:smoke`                | Read-only `@smoke` tests (safe on any env) |
| `pnpm test:regression`           | `@regression` tests                        |
| `pnpm test:ui`                   | Playwright UI mode                         |
| `pnpm codegen`                   | Record locators: `pnpm codegen $BASE_URL`  |
| `pnpm check-types` / `pnpm lint` | Static checks                              |

## Environment

See `.env.example`. Set `ALLOW_MUTATION=true` only on environments where tests may write data.

## CI

`.github/workflows/e2e.yml` — set GitHub Environment `dev` with vars `BASE_URL`, `TEST_ENV`, `ALLOW_MUTATION` and secrets `E2E_USERNAME`, `E2E_PASSWORD`.

Conventions for contributors / AI agents: see [AGENTS.md](AGENTS.md). Next steps: [docs/ROADMAP.md](docs/ROADMAP.md).

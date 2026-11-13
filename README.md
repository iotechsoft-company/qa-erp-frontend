# qa-erp-frontend

E2E automation tests for [erp-frontend](https://github.com/iotechsoft-company/erp-frontend) — **Playwright + TypeScript**.
Target: the **dev** environment (`BASE_URL` in `.env`, shared dev DB — no prod yet).

## Quick start

```bash
pnpm install
pnpm install:browsers
cp .env.example .env     # fill ADMIN_USERNAME / ADMIN_PASSWORD (an existing admin)
pnpm provision:users     # creates e2e.admin + e2e.staff, writes their passwords to .env
pnpm test:smoke
pnpm report              # open HTML report
```

## Scripts

| Command                            | Description                                                             |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `pnpm test`                        | Run all tests                                                           |
| `pnpm test:smoke`                  | Read-only `@smoke` tests (safe on any env)                              |
| `pnpm test:regression`             | `@regression` tests                                                     |
| `pnpm test:api`                    | `@api` factory ↔ API contract tests                                     |
| `pnpm test:ui` / `pnpm test:debug` | Playwright UI mode / debugger                                           |
| `pnpm codegen`                     | Record locators: `pnpm codegen $BASE_URL`                               |
| `pnpm auth`                        | Log in once and refresh `.auth/user.json` (also used by Playwright MCP) |
| `pnpm provision:users`             | Create / rotate test users `e2e.admin`, `e2e.staff` via IAM API         |
| `pnpm fetch:openapi`               | Download every BC's OpenAPI spec to `.openapi/` (gitignored)            |
| `pnpm cleanup:e2e [--apply]`       | List / delete leftover `E2E-` test data                                 |
| `pnpm check-types` / `pnpm lint`   | Static checks                                                           |

## Environment

See `.env.example`. `ALLOW_MUTATION=true` lets `@mutation` tests create/update/delete data — OK on dev,
must be `false` on any future prod. Never commit `.env`, `.auth/` or `.openapi/`.

## CI

`.github/workflows/e2e.yml` runs on PRs, weekdays 08:00 (Asia/Bangkok) and manually.
GitHub Environment `dev` holds vars `BASE_URL`, `TEST_ENV`, `ALLOW_MUTATION` and secrets `E2E_USERNAME`,
`E2E_PASSWORD`, `E2E_STAFF_USERNAME`, `E2E_STAFF_PASSWORD`.
After `pnpm provision:users` rotates passwords, update the secrets:

```bash
for k in E2E_PASSWORD E2E_STAFF_PASSWORD; do
  grep "^$k=" .env | cut -d= -f2- | tr -d '\n' | gh secret set $k --env dev -R iotechsoft-company/qa-erp-frontend
done
```

## AI agents (Claude Code & Codex)

Conventions: [AGENTS.md](AGENTS.md) · next steps: [docs/ROADMAP.md](docs/ROADMAP.md).

### Skills

| Skill            | When                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| `triage-failure` | A test failed / CI is red — classify flaky, test bug, data-env, app bug |
| `flaky-hunter`   | A test passes only sometimes                                            |
| `write-e2e-spec` | Add tests for a page or flow                                            |
| `report-bug`     | Confirmed app bug → GitHub issue in `erp-api` / `erp-frontend`          |
| `webapp-testing` | Throwaway recon script (vendored from `anthropics/skills`, recon only)  |

Invoke: Claude Code `/triage-failure` · Codex `$triage-failure` — or just describe the task; both agents pick a
skill from its `description`.

```
.claude/skills/<name>/SKILL.md     ← source of truth (Claude Code reads here)
.agents/skills/<name> → symlink    ← Codex reads here
.mcp.json                          ← Playwright MCP for Claude Code
.codex/config.toml                 ← Playwright MCP for Codex (keep in sync with .mcp.json)
```

### Creating a new skill

1. Create the folder and file (source of truth is always under `.claude/skills/`):
   ```bash
   mkdir -p .claude/skills/my-skill
   $EDITOR .claude/skills/my-skill/SKILL.md
   ```
2. `SKILL.md` must start with YAML frontmatter containing `name` (same as the folder, kebab-case) and
   `description` (what it does + when to use it + trigger phrases, incl. Thai ones — agents decide from this):
   ```markdown
   ---
   name: my-skill
   description: Do X for qa-erp-frontend. Use when ... or the user says "...", "...".
   ---

   # My skill

   > Works in Claude Code (`/skill-name`, `.claude/skills/`) and Codex (`$skill-name`, `.agents/skills/` → symlink).

   Steps, commands, rules...
   ```
   Optional subfolders: `scripts/`, `references/`, `assets/`. Keep instructions agent-neutral
   (no "Read tool", no scratchpad paths — use `mktemp -d`).
3. Expose it to Codex with a **relative** symlink:
   ```bash
   ln -s ../../.claude/skills/my-skill .agents/skills/my-skill
   ls -L .agents/skills/my-skill/SKILL.md   # must resolve
   ```
4. Add a row to the skills table above and in `AGENTS.md` → "QA tooling".
5. Restart / open a new session in both agents, check it is listed (`/` in Claude Code, `$` in Codex), commit.

### Troubleshooting: Codex doesn't see a skill

Work through in order:

1. **Start Codex inside this repo.** Codex scans `.agents/skills` from the current directory up to the repo
   root; opening a parent folder (e.g. `automate-tester/`) won't find them.
2. **Restart Codex / open a new session.** Skill changes are usually picked up automatically, but not always.
3. **Symlink resolves?**
   ```bash
   ls -la .agents/skills/                     # entries must be symlinks (->)
   ls -L .agents/skills/*/SKILL.md            # every one must resolve
   git ls-files -s .agents | awk '{print $1, $4}'   # mode must be 120000
   ```
   Broken or plain-text files (common after cloning on **Windows**): `git config core.symlinks true`, enable
   Developer Mode, then `git checkout -- .agents`. Re-create a broken link with
   `ln -sfn ../../.claude/skills/<name> .agents/skills/<name>`.
4. **Frontmatter valid?** It must be the very first thing in the file, between `---` lines, with `name` and
   `description`. A `:` inside an unquoted description can break YAML — quote the value if in doubt.
5. **Too many skills / long descriptions.** Codex caps the initial skill list (~2% of context, 8,000 chars
   when unknown) and may drop some. Shorten descriptions, or raise the budget in `~/.codex/config.toml`:
   `[skills]` → `max_context_tokens = 10000`.
6. **Name clash.** A skill with the same `name` in `~/.agents/skills` shows up twice — rename one.
7. **Implicit trigger not firing.** Call it explicitly with `$skill-name`. If an `agents/openai.yaml` sets
   `policy.allow_implicit_invocation: false`, only explicit calls work.
8. **Fallback that always works:** tell Codex _"read `.claude/skills/<name>/SKILL.md` and follow it"_ —
   `AGENTS.md` already points Codex there.

### Troubleshooting: Playwright MCP not available in Codex

- Codex loads `.codex/config.toml` only for **trusted** projects — accept the trust prompt when opening the
  repo (or mark it trusted in Codex settings). Untrusted = project MCP silently ignored.
- `.auth/user.json` missing/expired → `pnpm auth`.
- First start downloads `@playwright/mcp` via `npx`; `startup_timeout_sec = 60` covers that — if it still times
  out, run `npx -y @playwright/mcp@0.0.83 --help` once to warm the cache.
- The key is `mcp_servers` (snake_case) in TOML, unlike `mcpServers` in `.mcp.json`.

# Claude Code × Codex workflow

Two agents work on this repo. These rules keep `main` green and stop them from overwriting each other.

## Roles

| Agent                                | Role                                                                                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Codex** (desktop app, GPT-6.1 Sol) | **Builder** — page objects, factories, specs, one module at a time (see `docs/ROADMAP.md`)                                                                                        |
| **Claude Code**                      | **Reviewer & platform** — reviews PRs (`/code-review`), triages failures (`triage-failure`, `flaky-hunter`), files app bugs (`report-bug`), owns skills / hooks / CI / test users |

The user decides priorities; either agent may be asked to do the other's job — the rules below still apply.

## Where each agent works

| Agent       | Checkout                           | Branches                                  |
| ----------- | ---------------------------------- | ----------------------------------------- |
| Codex       | `qa-erp-frontend/` (main checkout) | `codex/<module>` — never commit on `main` |
| Claude Code | `../qa-erp-claude/` (git worktree) | `claude/<topic>`                          |

Create Claude's worktree once:

```bash
git worktree add ../qa-erp-claude -b claude/<topic> origin/main
ln -s ../qa-erp-frontend/.env ../qa-erp-claude/.env
cd ../qa-erp-claude && pnpm install && pnpm auth
```

## Flow for one module

1. **Start**: `git switch -c codex/<module> origin/main` (or `claude/<topic>`), pick an unchecked item in `docs/ROADMAP.md`.
2. **Build** with the `write-e2e-spec` skill. Commit small, **explicit paths only** (`git add <file>…`).
3. **Before pushing**: `pnpm check-types && pnpm lint`, the new specs green with `--repeat-each=2`,
   `pnpm cleanup:e2e` shows 0.
4. **PR**: `git push -u origin HEAD && gh pr create --fill --base main`. CI runs `@smoke` on the PR.
5. **Review**: Claude reviews the PR (comments on GitHub), runs the specs, triages failures.
   App bugs → `report-bug` issue in erp-api / erp-frontend + `test.fail()` with the link.
6. **Fix**: the author pushes fixes to the same branch.
7. **Merge**: squash-merge when CI is green and review is approved. Delete the branch. Tick ROADMAP.

## Talking to each other

- Durable channel: **PR comments and issues** in `iotechsoft-company/qa-erp-frontend` — every request and
  answer is recorded there.
- Direct channel (Claude → Codex desktop thread): `codex queue --thread <id> --message "<text>"` using the CLI
  bundled at `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`. The message is delivered
  to the thread's queue; Codex's reply appears in that thread (`~/.codex/sessions/**/rollout-*-<id>.jsonl`).
- Separate one-off Codex task: `codex exec -C <worktree> -s read-only "<task>"` (use `-s workspace-write`
  only inside a dedicated worktree).
- Messages say: what, which branch/PR, definition of done, and where to reply (PR comment).

## Never

- Commit or push to `main` directly, force-push, `git add -A`, `git stash`, `git reset --hard` (hooks block these).
- Edit files that belong to the other agent's open branch/PR — comment on the PR instead.
- Leave work uncommitted at the end of a session — commit to your branch (WIP commits are fine).

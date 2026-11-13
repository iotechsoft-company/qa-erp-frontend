#!/usr/bin/env node
// SessionStart — give the agent the shared-workspace picture before it touches anything:
// uncommitted work (possibly the other agent's), branch sync, auth state freshness, last test run.
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { context, readDotEnv, readInput, repoRoot, run } from './lib.mjs'

const input = readInput()
const root = repoRoot(input.cwd)
const lines = ['## qa-erp-frontend workspace status (from SessionStart hook)']

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], root).out.trim()
const sync = run('git', ['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`], root)
const [behind, ahead] = sync.ok ? sync.out.trim().split(/\s+/) : ['?', '?']
lines.push(`- Branch \`${branch}\` — ahead ${ahead}, behind ${behind} vs origin.`)

const status = run('git', ['status', '--porcelain'], root).out.split('\n').filter(Boolean)
if (status.length) {
  lines.push(
    `- **${status.length} uncommitted path(s)** — may belong to another agent (Claude Code / Codex) working in this tree.`,
    '  Do not stage, revert, stash or reformat them unless they are yours; commit with explicit paths only.',
    ...status.slice(0, 20).map((s) => `  - \`${s}\``),
  )
  if (status.length > 20) lines.push(`  - … ${status.length - 20} more`)
} else lines.push('- Working tree clean.')

const auth = path.join(root, '.auth/user.json')
if (!existsSync(auth)) lines.push('- `.auth/user.json` missing → run `pnpm auth` before using Playwright MCP.')
else {
  const hours = (Date.now() - statSync(auth).mtimeMs) / 36e5
  if (hours > 12)
    lines.push(
      `- \`.auth/user.json\` is ${hours.toFixed(0)}h old → run \`pnpm auth\` if MCP/browser shows the login page.`,
    )
}

const env = readDotEnv(root)
if (!env.E2E_USERNAME || !env.E2E_PASSWORD)
  lines.push('- `.env` lacks E2E credentials → `pnpm provision:users` (ask the user first).')

const lastRun = path.join(root, 'test-results/.last-run.json')
if (existsSync(lastRun)) {
  try {
    const r = JSON.parse(readFileSync(lastRun, 'utf8'))
    const age = ((Date.now() - statSync(lastRun).mtimeMs) / 36e5).toFixed(1)
    lines.push(
      `- Last local Playwright run (${age}h ago): ${r.status}${r.failedTests?.length ? `, ${r.failedTests.length} failed → use the triage-failure skill (\`pnpm exec playwright test --last-failed\`)` : ''}.`,
    )
  } catch {
    /* ignore */
  }
}
lines.push(
  '- Rules & skills: AGENTS.md (QA tooling table). Definition of done: check-types + lint clean, specs green, `pnpm cleanup:e2e` shows 0.',
)
context('SessionStart', lines.join('\n'))

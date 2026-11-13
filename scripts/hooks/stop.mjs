#!/usr/bin/env node
// Stop — if this session edited TS/JS, require `tsc` + eslint to be clean for THOSE files before the agent
// finishes. Errors in files the other agent is editing are reported, not blocking. No E2E run here
// (slow, hits shared dev) — opt in with QA_STOP_RUN_SPECS=1 to also run the edited spec files.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

import { bin, eslintErrors, readInput, repoRoot, run, touchedFile, truncate } from './lib.mjs'

const input = readInput()
const root = repoRoot(input.cwd)
const marker = touchedFile(root, input.session_id)
if (!existsSync(marker)) process.exit(0)

const touched = [...new Set(readFileSync(marker, 'utf8').split('\n').filter(Boolean))].filter((f) => existsSync(f))
if (!touched.length) {
  rmSync(marker, { force: true })
  process.exit(0)
}
const rel = touched.map((f) => path.relative(root, f))

const problems = []
const tsc = run(bin(root, 'tsc'), ['--noEmit', '--pretty', 'false'], root)
const tscErrors = tsc.ok ? [] : tsc.out.split('\n').filter((l) => /error TS\d+/.test(l))
const mine = tscErrors.filter((l) => rel.some((r) => l.startsWith(r)))
const others = tscErrors.filter((l) => !mine.includes(l))
if (mine.length) problems.push(`TypeScript errors in files you edited:\n${mine.join('\n')}`)

const lint = eslintErrors(root, touched)
if (lint) problems.push(`ESLint errors:\n${lint}`)

if (!problems.length && process.env.QA_STOP_RUN_SPECS === '1') {
  const specs = rel.filter((r) => r.endsWith('.spec.ts'))
  if (specs.length) {
    const pw = run(bin(root, 'playwright'), ['test', ...specs, '--reporter=line'], root)
    if (!pw.ok) problems.push(`Playwright failures in edited specs:\n${pw.out.split('\n').slice(-40).join('\n')}`)
  }
}

if (problems.length && !input.stop_hook_active) {
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason: truncate(`Before finishing, fix these (definition of done in AGENTS.md):\n\n${problems.join('\n\n')}`),
    }),
  )
  process.exit(0)
}

rmSync(marker, { force: true })
const notes = []
if (problems.length)
  notes.push(`qa hook: still failing after a retry — ${problems.length} problem group(s); tell the user.`)
if (others.length)
  notes.push(
    `qa hook: ${others.length} TS error(s) in files not edited this session (likely another agent's work in progress).`,
  )
if (notes.length) process.stdout.write(JSON.stringify({ systemMessage: notes.join(' ') }))
process.exit(0)

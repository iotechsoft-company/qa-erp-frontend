#!/usr/bin/env node
// PostToolUse — after an agent edits TS/JS: prettier --write + eslint on just those files,
// feed lint errors back to the model, and remember the files for the Stop hook.
import { appendFileSync, existsSync } from 'node:fs'
import path from 'node:path'

import { bin, describeToolCall, eslintErrors, readInput, repoRoot, run, touchedFile, truncate } from './lib.mjs'

const input = readInput()
const root = repoRoot(input.cwd)
const call = describeToolCall(input, root)
if (call.kind !== 'edit') process.exit(0)

const files = call.files
  .filter((f) => /\.(m?[jt]sx?)$/.test(f) && existsSync(f))
  .filter((f) => !path.relative(root, f).startsWith('..') && !f.includes(`${path.sep}node_modules${path.sep}`))
if (!files.length) process.exit(0)

appendFileSync(touchedFile(root, input.session_id), files.map((f) => `${f}\n`).join(''))

run(bin(root, 'prettier'), ['--write', '--log-level', 'warn', ...files], root)
const lint = eslintErrors(root, files)
if (lint) {
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason: `ESLint errors in the file(s) you just edited — fix them (AGENTS.md rules: no waitForTimeout/networkidle/force):\n${truncate(lint)}`,
    }),
  )
}
process.exit(0)

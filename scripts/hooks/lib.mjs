// Shared helpers for Claude Code + Codex hooks (same stdin JSON / stdout JSON protocol).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const readInput = () => {
  try {
    const raw = readFileSync(0, 'utf8')
    return raw.trim() ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export const repoRoot = (cwd = process.cwd()) => {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim()
  } catch {
    return cwd
  }
}

/** Repos this suite must only read (default: sibling erp-frontend checkout). */
export const readonlyDirs = (root) =>
  (process.env.QA_READONLY_DIRS ?? path.resolve(root, '../../nextjs/erp-frontend'))
    .split(':')
    .filter(Boolean)
    .map((d) => path.resolve(d))

/** KEY=VALUE pairs from <root>/.env (never printed). */
export const readDotEnv = (root) => {
  const file = path.join(root, '.env')
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  )
}

/**
 * Normalise a tool call into { files: string[], added: string, command?: string }.
 * Claude: Edit/Write/MultiEdit (file_path + content/new_string/edits[]), Bash (command).
 * Codex:  apply_patch (tool_input.command = patch text), Bash (command).
 */
export const describeToolCall = (input, root) => {
  const name = input.tool_name ?? ''
  const ti = input.tool_input ?? {}
  const cwd = input.cwd ?? root
  const abs = (p) => path.resolve(cwd, p)

  if (name === 'Bash') return { kind: 'bash', files: [], added: '', command: String(ti.command ?? '') }

  if (name === 'apply_patch' || (typeof ti.command === 'string' && ti.command.includes('*** Begin Patch'))) {
    const patch = String(ti.command ?? ti.patch ?? ti.input ?? '')
    const files = [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm)].map((m) =>
      abs((m[1] ?? m[2]).trim()),
    )
    const added = patch
      .split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .map((l) => l.slice(1))
      .join('\n')
    return { kind: 'edit', files, added }
  }

  if (ti.file_path || ti.path) {
    const added = [ti.content, ti.new_string, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e.new_string) : [])]
      .filter((s) => typeof s === 'string')
      .join('\n')
    return { kind: 'edit', files: [abs(ti.file_path ?? ti.path)], added }
  }
  return { kind: 'other', files: [], added: '' }
}

export const deny = (event, reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: event, permissionDecision: 'deny', permissionDecisionReason: reason },
    }),
  )
  process.exit(0)
}

export const context = (event, text) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }))
  process.exit(0)
}

/** Per-session list of files an agent edited (kept inside .git so it is never committed). */
export const touchedFile = (root, sessionId) => {
  let gitDir = path.join(root, '.git')
  try {
    gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    /* fall back */
  }
  const dir = path.join(gitDir, 'qa-hooks')
  mkdirSync(dir, { recursive: true })
  return path.join(dir, `${String(sessionId ?? 'unknown').replace(/[^\w.-]/g, '_')}.touched`)
}

export const bin = (root, name) => path.join(root, 'node_modules', '.bin', name)

export const run = (cmd, args, root) => {
  try {
    return {
      ok: true,
      out: execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    }
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

/** ESLint errors (severity 2) for the given files as "path:line:col rule — message" lines, or ''. */
export const eslintErrors = (root, files) => {
  if (!files.length) return ''
  const r = run(bin(root, 'eslint'), ['--no-warn-ignored', '--format', 'json', ...files], root)
  let report
  try {
    report = JSON.parse(r.out.slice(r.out.indexOf('[')))
  } catch {
    return r.ok ? '' : `eslint failed to run:\n${r.out.slice(0, 500)}`
  }
  return report
    .flatMap((f) =>
      f.messages
        .filter((m) => m.severity === 2)
        .map((m) => `${path.relative(root, f.filePath)}:${m.line}:${m.column} ${m.ruleId ?? ''} — ${m.message}`),
    )
    .join('\n')
}

export const truncate = (s, max = 6000) => (s.length > max ? `${s.slice(0, max)}\n… (truncated)` : s)

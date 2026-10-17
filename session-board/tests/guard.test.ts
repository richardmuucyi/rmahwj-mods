import { expect, test } from 'claude-code/testing'

import {
  AFTER_TOKENS,
  DEFAULTS,
  DEFAULT_INSTRUCTIONS,
  afterCompact,
  compactInstructions,
  countRequest,
  dayKey,
  decide,
  expiredDays,
  fmtK,
  formatDay,
  formatDecision,
  initialState,
  isCommitCall,
  logDir,
  logPath,
  parseConfig,
  parseMode,
  recall,
  savingPerRequest,
  shouldLogDecision,
  sparkWithMarks,
  summarizeDay,
} from '../hooks/guard'
import type { DecisionLog } from '../hooks/guard'
import { guardLook, guardOpensWithChip } from '../hooks/guard-glue'
import type { GuardView } from '../types'
import { CFG, F, NOW, ROWS, ST } from './guard-cases'

const MIN = 60_000

// ── the decision table ─────────────────────────────────────────────────────────

for (const r of ROWS) {
  test(`decide: ${r.name}`, () => {
    const d = decide({ ...CFG, ...r.cfg }, { ...ST, ...r.st }, { ...F, ...r.f })
    expect(d.chip).toBe(r.want.chip)
    if (r.want.grade !== undefined) expect(d.grade).toBe(r.want.grade)
    if (r.want.reason !== undefined) expect(d.reason).toBe(r.want.reason)
    // the guard only advises: a decision carries no way to start anything by itself
    expect('autoStart' in d).toBe(false)
  })
}

/** This harness's expect has no toBeCloseTo. */
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

test('decide: the saving per request is what the page says: (ctx - 120K) x $0.21 per million', () => {
  expect(AFTER_TOKENS).toBe(120_000)
  expect(near(savingPerRequest(312_000), 0.04032)).toBe(true)
  expect(near(savingPerRequest(412_000), 0.06132)).toBe(true)
  expect(near(savingPerRequest(755_000), 0.13335)).toBe(true)
  expect(savingPerRequest(120_000)).toBe(0)
  expect(savingPerRequest(80_000)).toBe(0)
  expect(near(decide(CFG, ST, { ...F, ctx: 412_000 }).saving, 0.06132)).toBe(true)
})

test('DEFAULTS are the numbers the user chose on 2026-10-13 (auto mode and its two numbers went in 0.19.0; snooze and typing in 0.21.0)', () => {
  expect(DEFAULTS).toEqual({
    mode: 'advise',
    dimAt: 200_000,
    adviseAt: 300_000,
    minGrowth: 150_000,
    cooldownRequests: 8,
    cooldownMs: 20 * MIN,
  })
})

// ── state moves ────────────────────────────────────────────────────────────────

test('initialState: a fresh session is not cooling and has the baseline floor', () => {
  const st = initialState()
  expect(st.floor).toBe(120_000)
  expect(st.lastCompactAt).toBeUndefined()
  expect(st.shrinkFailures).toBe(0)
  expect(decide(CFG, st, { ...F, ctx: 312_000 }).chip).toBe('advise')
})

test('afterCompact: the floor becomes the size after, and the clock and the request count restart', () => {
  const st = afterCompact(CFG, ST, { before: 755_000, after: 121_000, now: NOW })
  expect(st.floor).toBe(121_000)
  expect(st.lastCompactAt).toBe(NOW)
  expect(st.requestsSinceCompact).toBe(0)
  expect(st.shrinkFailures).toBe(0)
})

test('afterCompact: one that did not shrink (after over 80% of before) counts as a failure, a good one resets the count', () => {
  const a = afterCompact(CFG, ST, { before: 500_000, after: 450_000, now: NOW })
  expect(a.shrinkFailures).toBe(1)
  const b = afterCompact(CFG, a, { before: 520_000, after: 500_000, now: NOW + MIN })
  expect(b.shrinkFailures).toBe(2)
  const c = afterCompact(CFG, b, { before: 520_000, after: 130_000, now: NOW + 2 * MIN })
  expect(c.shrinkFailures).toBe(0)
  // 80% exactly counts as shrunk
  expect(afterCompact(CFG, ST, { before: 500_000, after: 400_000, now: NOW }).shrinkFailures).toBe(0)
})

test('afterCompact: two failures in a row stop the guard (end to end through decide)', () => {
  let st = afterCompact(CFG, ST, { before: 500_000, after: 450_000, now: NOW })
  st = afterCompact(CFG, st, { before: 650_000, after: 600_000, now: NOW + 30 * MIN })
  st = { ...st, requestsSinceCompact: 50 }
  expect(decide(CFG, st, { ...F, now: NOW + 90 * MIN, ctx: 800_000 }).chip).toBe('stopped')
})

test('afterCompact: no size after (the engine did not record one): the floor stays, failures unchanged', () => {
  const st = afterCompact(CFG, { ...ST, floor: 130_000, shrinkFailures: 1 }, { before: 500_000, now: NOW })
  expect(st.floor).toBe(130_000)
  expect(st.shrinkFailures).toBe(1)
  expect(st.lastCompactAt).toBe(NOW)
})

test('countRequest: one more request since the last compaction, nothing else moves', () => {
  const st = countRequest({ ...ST, requestsSinceCompact: 3 })
  expect(st.requestsSinceCompact).toBe(4)
  expect(st.floor).toBe(ST.floor)
})

// ── a commit or a push in a shell command ──────────────────────────────────────

test('isCommitCall: commits and pushes count', () => {
  for (const c of [
    'git commit -m "x"',
    'git add -A && git commit -m x',
    'git push',
    'git push origin main',
    'cd /c/work/repo && git commit -am y',
    'git -C repo push',
    'git commit --amend --no-edit',
    'git add . ; git commit -m "a b" ; git push',
  ])
    expect(isCommitCall(c), c).toBe(true)
})

test('isCommitCall: reading git, dry runs, a quoted mention and other tools do not', () => {
  for (const c of [
    '',
    'git status',
    'git log -1 --format=%H',
    'git diff --stat',
    'git commit --dry-run',
    'git push --dry-run origin main',
    'echo "git push"',
    'grep "git commit" notes.md',
    'gh pr create --fill',
    'git stash push',
    'git commit-graph write',
  ])
    expect(isCommitCall(c), c).toBe(false)
})

// ── what the summary is told ───────────────────────────────────────────────────

const FACTS = {
  ctx: 412_000,
  branch: 'main',
  lastCommit: '650df709',
  uncommitted: ['docs/session-board/hooks/guard.ts', '90 System/Generated HTMLs/vault/context-guard-design.html'],
  jobs: ['shell: render_upscales.py --sent', 'monitor: run_all_2x.log'],
  agents: ['Explore · haiku'],
  assumptions: ['A2', 'A5'],
}

test('DEFAULT_INSTRUCTIONS: the six sections in order, and what to leave out', () => {
  const t = DEFAULT_INSTRUCTIONS
  const at = ['1. Rules still in force', '2. State', '3. Identifiers, copied exactly', '4. Decisions and rejections', '5. Open questions', '6. Verify first', 'Leave out:'].map(s => t.indexOf(s))
  expect(at.every(i => i >= 0)).toBe(true)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
  expect(t).toContain('"Approved:"')
  expect(t).toContain('6-character picture ids')
  expect(t).toContain('ports and PIDs')
})

test('compactInstructions: a /compact you press Enter on is never changed, bare or with your words', () => {
  expect(compactInstructions({ trigger: 'manual', base: DEFAULT_INSTRUCTIONS, facts: FACTS })).toBeUndefined()
})

test('compactInstructions: the engine at its threshold, a plugin and a precompute get the text and the facts', () => {
  for (const trigger of ['auto', 'plugin', 'precompute'] as const) {
    const t = compactInstructions({ trigger, base: DEFAULT_INSTRUCTIONS, facts: FACTS })
    expect(t, trigger).toBeDefined()
    expect(t!.startsWith(DEFAULT_INSTRUCTIONS)).toBe(true)
    expect(t).toContain('Facts from the session board')
  }
})

test('compactInstructions: the facts block carries the board data, one path per line', () => {
  const t = compactInstructions({ trigger: 'auto', base: 'BASE', facts: FACTS })!
  expect(t).toContain('Context before compaction: 412K · branch main · last commit 650df709')
  expect(t).toContain('  - docs/session-board/hooks/guard.ts')
  expect(t).toContain('  - 90 System/Generated HTMLs/vault/context-guard-design.html')
  expect(t).toContain('  - shell: render_upscales.py --sent')
  expect(t).toContain('Subagents running: Explore · haiku')
  expect(t).toContain('Assumptions still open: A2, A5')
})

test('compactInstructions: empty lists say none, not nothing', () => {
  const t = compactInstructions({ trigger: 'auto', base: 'BASE', facts: { ...FACTS, uncommitted: [], jobs: [], agents: [], assumptions: [], branch: undefined, lastCommit: undefined } })!
  expect(t).toContain('Uncommitted files from this session: none')
  expect(t).toContain('Background jobs: none')
  expect(t).toContain('Subagents running: none')
  expect(t).toContain('Assumptions still open: none')
  expect(t).toContain('Context before compaction: 412K')
  expect(t).not.toContain('branch undefined')
})

test('compactInstructions: a long file list is cut at 20 and says how many more', () => {
  const many = Array.from({ length: 27 }, (_, i) => `f${i}.py`)
  const t = compactInstructions({ trigger: 'auto', base: 'BASE', facts: { ...FACTS, uncommitted: many } })!
  expect(t).toContain('  - f19.py')
  expect(t).not.toContain('  - f20.py')
  expect(t).toContain('… and 7 more')
})

// ── recall: how many ids and paths the new summary kept ────────────────────────

test('recall: counts the files, ports, post ids, study numbers and hashes that survived', () => {
  const before = 'edit build_compare.py, the server on :8199, post 144917056, study 0095, commit 650df709, and build_compare.py again'
  const summary = 'We were editing build_compare.py for study 0095.'
  const r = recall(before, summary)
  expect(r.total).toBe(5)
  expect(r.found).toBe(2)
  expect(r.missing.sort()).toEqual(['144917056', '650df709', '8199'])
})

test('recall: case does not matter, and a repeated id counts once', () => {
  const r = recall('Run Test_Foo.PY then test_foo.py', 'the file TEST_FOO.py')
  expect(r.total).toBe(1)
  expect(r.found).toBe(1)
})

test('recall: plain numbers and words are not identifiers; nothing to keep is a total of 0', () => {
  const r = recall('it took 1.5 s and 42 requests, version 2.1.296, see the page', 'x')
  expect(r.total).toBe(0)
  expect(r.found).toBe(0)
  expect(r.missing).toEqual([])
})

test('recall: full marks when every one is there', () => {
  const r = recall('a.py b.json :8080 0042', 'a.py, b.json, port 8080 and 0042')
  expect(r.total).toBe(4)
  expect(r.found).toBe(4)
})

// ── small formatters ───────────────────────────────────────────────────────────

test('fmtK: thousands as K, a million and over as M', () => {
  expect(fmtK(412_345)).toBe('412K')
  expect(fmtK(99_999)).toBe('100K')
  expect(fmtK(1_000)).toBe('1K')
  expect(fmtK(0)).toBe('0K')
  expect(fmtK(967_000)).toBe('967K')
  expect(fmtK(1_000_000)).toBe('1.0M')
  expect(fmtK(1_250_000)).toBe('1.3M')
})

test('sparkWithMarks: one glyph per turn by size, a bar where a compaction dropped it', () => {
  expect(sparkWithMarks([], 1_000_000)).toBe('')
  expect(sparkWithMarks([0, 500_000, 1_000_000], 1_000_000)).toBe('▁▅█')
  const s = sparkWithMarks([300_000, 500_000, 900_000, 120_000, 200_000], 1_000_000)
  expect(s).toBe('▃▅▇│▂▂')
  // a drop to 60% or more of the one before is not a compaction
  expect(sparkWithMarks([500_000, 400_000], 1_000_000)).toBe('▅▄')
})

// ── config ─────────────────────────────────────────────────────────────────────

test('parseConfig: nothing set gives the defaults', () => {
  expect(parseConfig({})).toEqual(DEFAULTS)
})

test('parseConfig: the threshold is in thousands, the mode is checked', () => {
  expect(parseConfig({ adviseAtK: 250 }).adviseAt).toBe(250_000)
  expect(parseConfig({ mode: 'off' }).mode).toBe('off')
  expect(parseConfig({ mode: 'advise' }).mode).toBe('advise')
  expect(parseConfig({ mode: 'sometimes' }).mode).toBe('advise')
  expect(parseConfig({ mode: 7 }).mode).toBe('advise')
})

test('parseConfig: bad numbers fall back to 300K', () => {
  expect(parseConfig({ adviseAtK: 'lots' }).adviseAt).toBe(300_000)
  expect(parseConfig({ adviseAtK: 20 }).adviseAt).toBe(300_000)
  expect(parseConfig({ adviseAtK: -5 }).adviseAt).toBe(300_000)
  expect(parseConfig({ adviseAtK: '350' }).adviseAt).toBe(350_000)
})

test('parseConfig and parseMode: the removed auto mode reads as advise, and the removed settings change nothing', () => {
  expect(parseMode('auto')).toBe('advise')
  expect(parseMode('off')).toBe('off')
  expect(parseMode('advise')).toBe('advise')
  expect(parseMode(undefined)).toBe('advise')
  expect(parseConfig({ mode: 'auto' }).mode).toBe('advise')
  // autoAtK and vetoSeconds from an older /config are ignored: the result is the defaults
  expect(parseConfig({ autoAtK: 450, vetoSeconds: 15 })).toEqual(DEFAULTS)
  const c = parseConfig({ mode: 'auto', autoAtK: 450, vetoSeconds: 15 }) as unknown as Record<string, unknown>
  expect('autoAt' in c).toBe(false)
  expect('vetoSeconds' in c).toBe(false)
})

test('shouldLogDecision: a new context size at a turn end with something to say', () => {
  const base = { changedContext: true, chip: 'advise' as const, ctx: 312_000, lastCtx: undefined }
  expect(shouldLogDecision(base)).toBe(true)
  expect(shouldLogDecision({ ...base, chip: 'dim' })).toBe(true)
  expect(shouldLogDecision({ ...base, chip: 'stopped' })).toBe(true)
})

test('shouldLogDecision: nothing to say, a rate-limit-only measure, or the same size again is not a decision', () => {
  const base = { changedContext: true, chip: 'advise' as const, ctx: 312_000, lastCtx: undefined }
  expect(shouldLogDecision({ ...base, chip: 'none' })).toBe(false)
  expect(shouldLogDecision({ ...base, changedContext: false })).toBe(false)
  expect(shouldLogDecision({ ...base, lastCtx: 312_000 })).toBe(false)
  expect(shouldLogDecision({ ...base, lastCtx: 311_999 })).toBe(true)
})

test('dayKey: the local date, padded', () => {
  expect(dayKey(new Date(2026, 9, 13, 23, 59, 59).getTime())).toBe('2026-10-13')
  expect(dayKey(new Date(2026, 0, 5, 0, 0, 0).getTime())).toBe('2026-01-05')
  expect(dayKey(new Date(2026, 11, 31, 12, 0, 0).getTime())).toBe('2026-12-31')
})

const DAY_MS = new Date(2026, 9, 13, 10, 0, 0).getTime()
const BOARD = '/home/me/.claude/session-board'

test('logPath: guard/<day>/<session>.jsonl beside the board, never in the journal log folder', () => {
  expect(logPath(BOARD, DAY_MS, 'abc-123')).toBe(`${BOARD}/guard/2026-10-13/abc-123.jsonl`)
  expect(logPath(`${BOARD}/`, DAY_MS, 'abc-123')).toBe(`${BOARD}/guard/2026-10-13/abc-123.jsonl`)
  expect(logPath(BOARD, DAY_MS, 'abc-123')).not.toContain('/log/')
})

test('logPath: a session id cannot climb out of the folder', () => {
  const p = logPath(BOARD, DAY_MS, '../../etc/passwd')
  expect(p.startsWith(`${BOARD}/guard/2026-10-13/`)).toBe(true)
  expect(p).not.toContain('..')
  expect(p.slice(`${BOARD}/guard/2026-10-13/`.length)).not.toContain('/')
})

const ENTRY: DecisionLog = {
  ts: 1_792_000_000_000,
  at: '10:02:11',
  project: 'vault',
  mode: 'advise',
  ctx: 312_000,
  window: 1_000_000,
  chip: 'advise',
  grade: 'good',
  advised: true,
  saving: 0.04032,
  floor: 125_000,
  jobs: 0,
  mine: 0,
  committed: true,
}

test('formatDecision: one JSON line with ctx, grade, advised and the saving rounded to 4 places; no would_compact', () => {
  const line = formatDecision(ENTRY)
  expect(line.includes('\n')).toBe(false)
  const back = JSON.parse(line)
  expect(back.ctx).toBe(312_000)
  expect(back.grade).toBe('good')
  expect(back.advised).toBe(true)
  expect('would_compact' in back).toBe(false)
  expect(back.saving).toBe(0.0403)
  expect(back).toEqual({ ...ENTRY, saving: 0.0403 })
})

test('formatDecision: the keys keep one order, and an empty grade or reason is left out', () => {
  expect(Object.keys(JSON.parse(formatDecision(ENTRY)))).toEqual(['ts', 'at', 'project', 'mode', 'ctx', 'window', 'chip', 'grade', 'advised', 'saving', 'floor', 'jobs', 'mine', 'committed'])
  const withReason = JSON.parse(formatDecision({ ...ENTRY, chip: 'dim', grade: 'ok', reason: 'cooldown', jobs: 2 }))
  expect(Object.keys(withReason).slice(6, 10)).toEqual(['chip', 'grade', 'reason', 'advised'])
  const dim = JSON.parse(formatDecision({ ...ENTRY, chip: 'dim', grade: undefined }))
  expect('grade' in dim).toBe(false)
  expect('reason' in dim).toBe(false)
})

test('formatDecision: a newline in a field cannot break the one-line-per-decision rule', () => {
  const line = formatDecision({ ...ENTRY, project: 'a\nb', reason: 'x\ry' })
  expect(line.includes('\n')).toBe(false)
  expect(line.includes('\r')).toBe(false)
  expect(JSON.parse(line).project).toBe('a\nb')
})

test('expiredDays: day folders older than 30 days, only ones named as a date', () => {
  const now = new Date(2026, 9, 13, 10, 0, 0).getTime()
  const names = ['2026-08-01', '2026-09-12', '2026-09-14', '2026-10-12', 'notes', '2026-9-1', '2026-13-45', '2026-09-13x']
  expect(expiredDays(names, now, 30)).toEqual(['2026-08-01', '2026-09-12'])
  expect(expiredDays([], now, 30)).toEqual([])
  expect(expiredDays(['2026-10-12'], now, 0)).toEqual(['2026-10-12'])
})

// ── today's line in the Context tab ────────────────────────────────────────────

/** One log line the way the writer makes it, with fields to change. */
const LL = (o: Record<string, unknown> = {}) => JSON.stringify({ ctx: 312_000, chip: 'advise', advised: false, saving: 0.0403, ...o })

test('logDir: guard/<day> beside the board: the folder the log files sit in', () => {
  expect(logDir(BOARD, DAY_MS)).toBe(`${BOARD}/guard/2026-10-13`)
  expect(logDir(`${BOARD}/`, DAY_MS)).toBe(`${BOARD}/guard/2026-10-13`)
  expect(logDir(BOARD, DAY_MS)).not.toContain('/log/')
  expect(logPath(BOARD, DAY_MS, 's1').startsWith(`${logDir(BOARD, DAY_MS)}/`)).toBe(true)
})

test('summarizeDay: nothing to read gives zeros', () => {
  expect(summarizeDay([])).toEqual({ logged: 0, advised: 0, saving: 0 })
  expect(summarizeDay(['', '\n\n'])).toEqual({ logged: 0, advised: 0, saving: 0 })
})

test('summarizeDay: counts every decision, counts the advised ones, and sums the saving of those only', () => {
  const text = `${[LL({ advised: true, ctx: 512_000, saving: 0.0823 }), LL(), LL({ advised: true, ctx: 555_000, saving: 0.0914 })].join('\n')}\n`
  expect(summarizeDay([text])).toEqual({ logged: 3, advised: 2, saving: 0.1737 })
})

test('summarizeDay: the files of several sessions add up', () => {
  const a = `${LL({ advised: true, saving: 0.0823 })}\n${LL()}\n`
  const b = `${LL({ advised: true, saving: 0.0914 })}\n`
  expect(summarizeDay([a, b])).toEqual({ logged: 3, advised: 2, saving: 0.1737 })
})

test('summarizeDay: the sum is rounded to four places, so there is no float noise', () => {
  expect(summarizeDay([[LL({ advised: true, saving: 0.1 }), LL({ advised: true, saving: 0.2 })].join('\n')]).saving).toBe(0.3)
})

test('summarizeDay: blank lines, CRLF, a half-written last line and lines that are not decisions are skipped', () => {
  const text = ['', LL({ advised: true, saving: 0.08 }), 'not json', '[1,2]', 'null', '42', '"x"', '{"old":1}', '{"ctx":"big","advised":true,"saving":9}', '{"ctx":512000,"advis'].join('\r\n')
  expect(summarizeDay([text])).toEqual({ logged: 1, advised: 1, saving: 0.08 })
})

test('summarizeDay: advised must be true and a saving must be a number; anything else adds nothing', () => {
  const text = [
    LL({ advised: 'true', saving: 0.5 }),
    LL({ advised: true, saving: '0.4' }),
    LL({ advised: true, saving: null }),
    '{"ctx":300000,"advised":true}',
  ].join('\n')
  expect(summarizeDay([text])).toEqual({ logged: 4, advised: 3, saving: 0 })
})

test('summarizeDay: a would_compact field in an older line is ignored', () => {
  const old = JSON.stringify({ ctx: 512_000, chip: 'advise', advised: false, would_compact: true, saving: 0.0823 })
  expect(summarizeDay([old])).toEqual({ logged: 1, advised: 0, saving: 0 })
})

test('formatDay: the three numbers in one line', () => {
  expect(formatDay({ logged: 14, advised: 5, saving: 0.4115 })).toBe('14 decisions · 5 advised · $0.41 per request, summed')
})

test('formatDay: one decision is singular; nothing logged says so', () => {
  expect(formatDay({ logged: 1, advised: 1, saving: 0.0823 })).toBe('1 decision · 1 advised · $0.08 per request, summed')
  expect(formatDay({ logged: 3, advised: 0, saving: 0 })).toBe('3 decisions · 0 advised · $0.00 per request, summed')
  expect(formatDay({ logged: 0, advised: 0, saving: 0 })).toBe('no decisions logged yet')
})

// ── the context row's look: which states open with a black chip ────────────────────────────────────────────
// The quiet and advice rows start with the plain Actions button (the context size is in the usage gauge), so they sit
// directly under the strip. The status rows start with a black chip like the strip's, so they keep one empty row between.

test('guardLook and guardOpensWithChip: the status states open with a black chip, the quiet and advice rows do not', () => {
  const view = (o: Partial<GuardView>) => ({ chip: 'none', phase: 'idle', saving: 0, ctx: 0, window: 1_000_000, jobs: 0, ...o }) as GuardView
  const done = { before: 400_000, after: 120_000, saving: 0.05 }
  const cases: [string, Partial<GuardView>, string, boolean][] = [
    ['nothing to show', {}, 'none', false],
    ['quiet number', { chip: 'dim' }, 'dim', false],
    ['advice', { chip: 'advise' }, 'advise', false],
    ['stopped', { chip: 'stopped' }, 'stopped', true],
    ['compacting (wins over the advice beneath it)', { phase: 'compacting', chip: 'advise' }, 'compacting', true],
    ['compacted, with its result', { phase: 'done', done, chip: 'advise' }, 'done', true],
    ['a done phase with no result falls through to the advice', { phase: 'done', chip: 'advise' }, 'advise', false],
    ['failed (wins over the quiet number)', { phase: 'failed', chip: 'dim' }, 'failed', true],
  ]
  for (const [name, v, look, chip] of cases) {
    expect(guardLook(view(v)), `${name}: look`).toBe(look)
    expect(guardOpensWithChip(view(v)), `${name}: opens with a chip`).toBe(chip)
  }
})

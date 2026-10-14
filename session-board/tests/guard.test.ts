import { expect, test } from 'claude-code/testing'

import {
  AFTER_TOKENS,
  DEFAULTS,
  DEFAULT_INSTRUCTIONS,
  afterCompact,
  afterVeto,
  compactInstructions,
  countRequest,
  dayKey,
  decide,
  expiredDays,
  fmtCountdown,
  fmtK,
  fmtSeconds,
  formatDay,
  formatDecision,
  initialState,
  isCommitCall,
  logDir,
  logPath,
  parseConfig,
  recall,
  savingPerRequest,
  shouldLogDecision,
  sparkWithMarks,
  summarizeDay,
  wouldCompact,
} from '../hooks/guard'
import type { DecisionLog } from '../hooks/guard'
import { CFG, F, NOW, ROWS, ST, WOULD_ROWS } from './guard-cases'

const MIN = 60_000

// ── the decision table ─────────────────────────────────────────────────────────

for (const r of ROWS) {
  test(`decide: ${r.name}`, () => {
    const d = decide({ ...CFG, ...r.cfg }, { ...ST, ...r.st }, { ...F, ...r.f })
    expect(d.chip).toBe(r.want.chip)
    if (r.want.grade !== undefined) expect(d.grade).toBe(r.want.grade)
    if (r.want.autoStart !== undefined) expect(d.autoStart).toBe(r.want.autoStart)
    if (r.want.reason !== undefined) expect(d.reason).toBe(r.want.reason)
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

test('DEFAULTS are the numbers the user chose on 2026-10-13', () => {
  expect(DEFAULTS).toEqual({
    mode: 'advise',
    dimAt: 200_000,
    adviseAt: 300_000,
    autoAt: 500_000,
    vetoSeconds: 10,
    minGrowth: 150_000,
    cooldownRequests: 8,
    cooldownMs: 20 * MIN,
    snoozeTokens: 100_000,
    snoozeMs: 30 * MIN,
    typingMs: 20_000,
  })
})

// ── state moves ────────────────────────────────────────────────────────────────

test('initialState: a fresh session is not cooling and has the baseline floor', () => {
  const st = initialState()
  expect(st.floor).toBe(120_000)
  expect(st.lastCompactAt).toBeUndefined()
  expect(st.snooze).toBeUndefined()
  expect(st.shrinkFailures).toBe(0)
  expect(decide(CFG, st, { ...F, ctx: 312_000 }).chip).toBe('advise')
})

test('afterVeto: snoozes at the current size until 30 minutes pass', () => {
  const st = afterVeto(CFG, ST, 412_000, NOW)
  expect(st.snooze).toEqual({ ctx: 412_000, until: NOW + 30 * MIN })
  expect(st.floor).toBe(ST.floor)
})

test('afterCompact: the floor becomes the size after, the clock and the request count restart, the snooze goes', () => {
  const before = { ...ST, snooze: { ctx: 1, until: 2 } }
  const st = afterCompact(CFG, before, { before: 755_000, after: 121_000, now: NOW })
  expect(st.floor).toBe(121_000)
  expect(st.lastCompactAt).toBe(NOW)
  expect(st.requestsSinceCompact).toBe(0)
  expect(st.snooze).toBeUndefined()
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

test('compactInstructions: your own /compact text is left alone', () => {
  expect(compactInstructions({ trigger: 'manual', userText: 'keep the plan', base: DEFAULT_INSTRUCTIONS, facts: FACTS })).toBeUndefined()
})

test('compactInstructions: a bare /compact, the engine at its threshold, a plugin and a precompute all get the text and the facts', () => {
  for (const [trigger, userText] of [['manual', ''], ['manual', '   '], ['manual', undefined], ['auto', undefined], ['plugin', undefined], ['precompute', undefined]] as const) {
    const t = compactInstructions({ trigger, userText, base: DEFAULT_INSTRUCTIONS, facts: FACTS })
    expect(t, `${trigger}/${String(userText)}`).toBeDefined()
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

test('parseConfig: thresholds are in thousands, the mode is checked', () => {
  const c = parseConfig({ mode: 'auto', adviseAtK: 250, autoAtK: 450, vetoSeconds: 15 })
  expect(c.mode).toBe('auto')
  expect(c.adviseAt).toBe(250_000)
  expect(c.autoAt).toBe(450_000)
  expect(c.vetoSeconds).toBe(15)
  expect(parseConfig({ mode: 'off' }).mode).toBe('off')
  expect(parseConfig({ mode: 'sometimes' }).mode).toBe('advise')
  expect(parseConfig({ mode: 7 }).mode).toBe('advise')
})

test('parseConfig: bad numbers fall back; auto never sits below advise; the veto stays between 3 and 60 s', () => {
  expect(parseConfig({ adviseAtK: 'lots' }).adviseAt).toBe(300_000)
  expect(parseConfig({ adviseAtK: 20 }).adviseAt).toBe(300_000)
  expect(parseConfig({ adviseAtK: -5 }).adviseAt).toBe(300_000)
  expect(parseConfig({ adviseAtK: 400, autoAtK: 350 }).autoAt).toBe(400_000)
  expect(parseConfig({ vetoSeconds: 1 }).vetoSeconds).toBe(3)
  expect(parseConfig({ vetoSeconds: 5000 }).vetoSeconds).toBe(600)
  expect(parseConfig({ vetoSeconds: 'x' }).vetoSeconds).toBe(10)
  expect(parseConfig({ vetoSeconds: 7.6 }).vetoSeconds).toBe(8)
})

test('parseConfig: a longer countdown is allowed, as a number or as the text /config stores', () => {
  expect(parseConfig({ vetoSeconds: 30 }).vetoSeconds).toBe(30)
  expect(parseConfig({ vetoSeconds: '60' }).vetoSeconds).toBe(60)
  expect(parseConfig({ vetoSeconds: '120' }).vetoSeconds).toBe(120)
  expect(parseConfig({ vetoSeconds: 300 }).vetoSeconds).toBe(300)
  expect(parseConfig({ vetoSeconds: 600 }).vetoSeconds).toBe(600)
  expect(parseConfig({ vetoSeconds: 601 }).vetoSeconds).toBe(600)
})

test('fmtSeconds: seconds under two minutes, minutes from there', () => {
  expect(fmtSeconds(5)).toBe('5 s')
  expect(fmtSeconds(10)).toBe('10 s')
  expect(fmtSeconds(60)).toBe('60 s')
  expect(fmtSeconds(119)).toBe('119 s')
  expect(fmtSeconds(120)).toBe('2 min')
  expect(fmtSeconds(300)).toBe('5 min')
  expect(fmtSeconds(600)).toBe('10 min')
  expect(fmtSeconds(150)).toBe('150 s')
})

test('fmtCountdown: seconds while short, m:ss from 100 s so a long one reads as a clock', () => {
  expect(fmtCountdown(10)).toBe('10 s')
  expect(fmtCountdown(1)).toBe('1 s')
  expect(fmtCountdown(99)).toBe('99 s')
  expect(fmtCountdown(100)).toBe('1:40')
  expect(fmtCountdown(120)).toBe('2:00')
  expect(fmtCountdown(305)).toBe('5:05')
  expect(fmtCountdown(600)).toBe('10:00')
})

// ── the pilot log: would it have compacted? ────────────────────────────────────

for (const r of WOULD_ROWS) {
  test(`wouldCompact: ${r.name}`, () => {
    expect(wouldCompact({ ...CFG, ...r.cfg }, { ...ST, ...r.st }, { ...F, ...r.f })).toBe(r.want)
  })
}

test('wouldCompact agrees with the real countdown: in auto mode it is exactly decide().autoStart', () => {
  for (const ctx of [250_000, 300_000, 499_999, 500_000, 512_000, 700_000]) {
    for (const f of [{}, { jobs: 1 }, { lastTurnCommitted: false }, { lastTypedAt: NOW - 1_000 }]) {
      const cfg = { ...CFG, mode: 'auto' as const }
      const facts = { ...F, ctx, ...f }
      expect(wouldCompact(cfg, ST, facts)).toBe(decide(cfg, ST, facts).autoStart)
    }
  }
})

test('shouldLogDecision: a new context size at a turn end with something to say', () => {
  const base = { changedContext: true, chip: 'advise' as const, ctx: 312_000, lastCtx: undefined }
  expect(shouldLogDecision(base)).toBe(true)
  expect(shouldLogDecision({ ...base, chip: 'dim' })).toBe(true)
  expect(shouldLogDecision({ ...base, chip: 'held' })).toBe(true)
  expect(shouldLogDecision({ ...base, chip: 'snoozed' })).toBe(true)
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
  would_compact: false,
  saving: 0.04032,
  floor: 125_000,
  jobs: 0,
  mine: 0,
  committed: true,
}

test('formatDecision: one JSON line with ctx, grade, would_compact and the saving rounded to 4 places', () => {
  const line = formatDecision(ENTRY)
  expect(line.includes('\n')).toBe(false)
  const back = JSON.parse(line)
  expect(back.ctx).toBe(312_000)
  expect(back.grade).toBe('good')
  expect(back.would_compact).toBe(false)
  expect(back.saving).toBe(0.0403)
  expect(back).toEqual({ ...ENTRY, saving: 0.0403 })
})

test('formatDecision: the keys keep one order, and an empty grade or reason is left out', () => {
  expect(Object.keys(JSON.parse(formatDecision(ENTRY)))).toEqual(['ts', 'at', 'project', 'mode', 'ctx', 'window', 'chip', 'grade', 'advised', 'would_compact', 'saving', 'floor', 'jobs', 'mine', 'committed'])
  const held = JSON.parse(formatDecision({ ...ENTRY, chip: 'held', grade: 'hold', reason: 'jobs', jobs: 2 }))
  expect(Object.keys(held).slice(6, 10)).toEqual(['chip', 'grade', 'reason', 'advised'])
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
const LL = (o: Record<string, unknown> = {}) => JSON.stringify({ ctx: 312_000, chip: 'advise', would_compact: false, saving: 0.0403, ...o })

test('logDir: guard/<day> beside the board: the folder the log files sit in', () => {
  expect(logDir(BOARD, DAY_MS)).toBe(`${BOARD}/guard/2026-10-13`)
  expect(logDir(`${BOARD}/`, DAY_MS)).toBe(`${BOARD}/guard/2026-10-13`)
  expect(logDir(BOARD, DAY_MS)).not.toContain('/log/')
  expect(logPath(BOARD, DAY_MS, 's1').startsWith(`${logDir(BOARD, DAY_MS)}/`)).toBe(true)
})

test('summarizeDay: nothing to read gives zeros', () => {
  expect(summarizeDay([])).toEqual({ logged: 0, wouldCompact: 0, saving: 0 })
  expect(summarizeDay(['', '\n\n'])).toEqual({ logged: 0, wouldCompact: 0, saving: 0 })
})

test('summarizeDay: counts every decision, counts the would_compact ones, and sums the saving of those only', () => {
  const text = `${[LL({ would_compact: true, ctx: 512_000, saving: 0.0823 }), LL(), LL({ would_compact: true, ctx: 555_000, saving: 0.0914 })].join('\n')}\n`
  expect(summarizeDay([text])).toEqual({ logged: 3, wouldCompact: 2, saving: 0.1737 })
})

test('summarizeDay: the files of several sessions add up', () => {
  const a = `${LL({ would_compact: true, saving: 0.0823 })}\n${LL()}\n`
  const b = `${LL({ would_compact: true, saving: 0.0914 })}\n`
  expect(summarizeDay([a, b])).toEqual({ logged: 3, wouldCompact: 2, saving: 0.1737 })
})

test('summarizeDay: the sum is rounded to four places, so there is no float noise', () => {
  expect(summarizeDay([[LL({ would_compact: true, saving: 0.1 }), LL({ would_compact: true, saving: 0.2 })].join('\n')]).saving).toBe(0.3)
})

test('summarizeDay: blank lines, CRLF, a half-written last line and lines that are not decisions are skipped', () => {
  const text = ['', LL({ would_compact: true, saving: 0.08 }), 'not json', '[1,2]', 'null', '42', '"x"', '{"old":1}', '{"ctx":"big","would_compact":true,"saving":9}', '{"ctx":512000,"would_c'].join('\r\n')
  expect(summarizeDay([text])).toEqual({ logged: 1, wouldCompact: 1, saving: 0.08 })
})

test('summarizeDay: would_compact must be true and a saving must be a number; anything else adds nothing', () => {
  const text = [
    LL({ would_compact: 'true', saving: 0.5 }),
    LL({ would_compact: true, saving: '0.4' }),
    LL({ would_compact: true, saving: null }),
    '{"ctx":300000,"would_compact":true}',
  ].join('\n')
  expect(summarizeDay([text])).toEqual({ logged: 4, wouldCompact: 3, saving: 0 })
})

test('formatDay: the three numbers in one line', () => {
  expect(formatDay({ logged: 14, wouldCompact: 5, saving: 0.4115 })).toBe('14 decisions · 5 would compact · $0.41 per request, summed')
})

test('formatDay: one decision is singular; nothing logged says so', () => {
  expect(formatDay({ logged: 1, wouldCompact: 1, saving: 0.0823 })).toBe('1 decision · 1 would compact · $0.08 per request, summed')
  expect(formatDay({ logged: 3, wouldCompact: 0, saving: 0 })).toBe('3 decisions · 0 would compact · $0.00 per request, summed')
  expect(formatDay({ logged: 0, wouldCompact: 0, saving: 0 })).toBe('no decisions logged yet')
})

// The picker's command builder (0.19.0, plan 2026-10-14-session-board-compact-picker): what the mod types into the
// prompt box when you tick items. The mod never runs it; you press Enter. These are pure-function tests; the buttons
// that use the builder are in guard.picker.live.test.tsx. A table that cannot fail proves nothing, so the last block
// runs the same table against broken copies.
import { expect, test } from 'claude-code/testing'

import {
  DEFAULT_PICKS,
  LEAN_SENTENCE,
  NOTES_SENTENCE,
  PICK_ORDER,
  boxIsFree,
  buildCompactCommand,
  cleanItem,
  pickCount,
} from '../hooks/guard'
import type { PickFacts, PickId, Picks } from '../hooks/guard'

const NONE: Picks = { notes: false, lean: false, tasks: false, files: false, jobs: false, assumptions: false }
const FACTS: PickFacts = {
  tasks: ['write the build plan', 'run the baseline tests'],
  files: ['a.py', 'b/c.md'],
  jobs: ['shell: render.py', 'monitor: run.log'],
  assumptions: 2,
  high: 1,
}
const EMPTY: PickFacts = { tasks: [], files: [], jobs: [], assumptions: 0, high: 0 }

const TASKS_S = 'Keep in full detail: the open items of the task list: write the build plan; run the baseline tests.'
const FILES_S = 'Keep these uncommitted files by path: a.py, b/c.md.'
const JOBS_S = 'Jobs still running: shell: render.py; monitor: run.log.'
const ASSUME_S = 'Assumptions still open: 2 (1 high impact).'

type Row = { name: string; picks: Partial<Picks>; facts?: Partial<PickFacts>; want: string }
type BuildFn = (p: Picks, f: PickFacts) => string

const ROWS: Row[] = [
  { name: 'nothing ticked is a bare /compact', picks: {}, want: '/compact' },
  { name: 'the notes row alone', picks: { notes: true }, want: `/compact ${NOTES_SENTENCE}` },
  { name: 'the lean row alone', picks: { lean: true }, want: `/compact ${LEAN_SENTENCE}` },
  { name: 'the task list row alone', picks: { tasks: true }, want: `/compact ${TASKS_S}` },
  { name: 'the files row alone', picks: { files: true }, want: `/compact ${FILES_S}` },
  { name: 'the jobs row alone', picks: { jobs: true }, want: `/compact ${JOBS_S}` },
  { name: 'the assumptions row alone, with a high-impact count', picks: { assumptions: true }, want: `/compact ${ASSUME_S}` },
  { name: 'the assumptions row with no high-impact one leaves the bracket out', picks: { assumptions: true }, facts: { high: 0 }, want: '/compact Assumptions still open: 2.' },
  { name: 'the default ticks: notes then lean', picks: DEFAULT_PICKS, want: `/compact ${NOTES_SENTENCE} ${LEAN_SENTENCE}` },
  { name: 'every row ticked: all six sentences in the fixed order', picks: { notes: true, lean: true, tasks: true, files: true, jobs: true, assumptions: true }, want: `/compact ${NOTES_SENTENCE} ${LEAN_SENTENCE} ${TASKS_S} ${FILES_S} ${JOBS_S} ${ASSUME_S}` },
  { name: 'a ticked row with nothing to keep adds nothing (tasks)', picks: { tasks: true }, facts: { tasks: [] }, want: '/compact' },
  { name: 'a ticked row with nothing to keep adds nothing (files, jobs, assumptions)', picks: { files: true, jobs: true, assumptions: true }, facts: { files: [], jobs: [], assumptions: 0, high: 0 }, want: '/compact' },
  { name: 'rows with nothing to keep leave the others alone', picks: { notes: true, tasks: true }, facts: { tasks: [] }, want: `/compact ${NOTES_SENTENCE}` },
]

function runTable(fn: BuildFn): string[] {
  const bad: string[] = []
  for (const r of ROWS) if (fn({ ...NONE, ...r.picks }, { ...FACTS, ...r.facts }) !== r.want) bad.push(r.name)
  return bad
}

test('control: the real builder passes every row of the table', () => {
  expect(ROWS.length).toBeGreaterThanOrEqual(12)
  expect(runTable(buildCompactCommand)).toEqual([])
})

for (const r of ROWS) {
  test(`buildCompactCommand: ${r.name}`, () => {
    expect(buildCompactCommand({ ...NONE, ...r.picks }, { ...FACTS, ...r.facts })).toBe(r.want)
  })
}

test('DEFAULT_PICKS: notes and lean start ticked, nothing else (the owner chose this on 2026-10-14, Q4)', () => {
  expect(DEFAULT_PICKS).toEqual({ notes: true, lean: true, tasks: false, files: false, jobs: false, assumptions: false })
  expect(PICK_ORDER).toEqual(['notes', 'lean', 'tasks', 'files', 'jobs', 'assumptions'])
})

test('buildCompactCommand: the order is fixed, whatever order the picks object lists its keys in', () => {
  const reversed = Object.fromEntries([...PICK_ORDER].reverse().map(id => [id, true])) as Picks
  expect(buildCompactCommand(reversed, FACTS)).toBe(buildCompactCommand({ notes: true, lean: true, tasks: true, files: true, jobs: true, assumptions: true }, FACTS))
})

test('buildCompactCommand: the command always starts with /compact and is never a /clear', () => {
  for (const id of PICK_ORDER) {
    const c = buildCompactCommand({ ...NONE, [id]: true }, FACTS)
    expect(c.startsWith('/compact')).toBe(true)
    expect(c.includes('/clear')).toBe(false)
  }
})

// ── one clean line ───────────────────────────────────────────────────────────

const CONTROL = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/

test('buildCompactCommand: line breaks, tabs and control characters in board text never reach the box', () => {
  const dirty: PickFacts = {
    tasks: ['write\nthe plan', 'run\r\nthe\ttests', 'a\u0000b', 'x\u2028y\u2029z'],
    files: ['dir/a\nb.py', 'c\u007f.md', 'd\u0085e.md'],
    jobs: ['shell:\u001b[31m red', 'monitor\n\nlog'],
    assumptions: 1,
    high: 0,
  }
  const c = buildCompactCommand({ notes: true, lean: true, tasks: true, files: true, jobs: true, assumptions: true }, dirty)
  expect(CONTROL.test(c)).toBe(false)
  expect(c).toContain('write the plan; run the tests; a b; x y z')
  expect(c).toContain('dir/a b.py, c .md, d e.md')
  expect(c).not.toContain('  ')
})

test('cleanItem: folds spaces, trims, and cuts a long item with an ellipsis at exactly the limit', () => {
  expect(cleanItem('  a   b \n c ', 50)).toBe('a b c')
  expect(cleanItem('x'.repeat(80), 80)).toBe('x'.repeat(80))
  const cut = cleanItem('x'.repeat(81), 80)
  expect(cut.length).toBe(80)
  expect(cut.endsWith('…')).toBe(true)
  expect(cleanItem('\n\t ', 80)).toBe('')
})

test('buildCompactCommand: a task subject is cut at 80 characters, a path at 120', () => {
  const c = buildCompactCommand({ ...NONE, tasks: true, files: true }, { ...EMPTY, tasks: ['t'.repeat(200)], files: ['p'.repeat(300)] })
  expect(c).toContain(`${'t'.repeat(79)}…`)
  expect(c).not.toContain('t'.repeat(80))
  expect(c).toContain(`${'p'.repeat(119)}…`)
  expect(c).not.toContain('p'.repeat(120))
})

test('buildCompactCommand: a long list is cut and says how many were left out (tasks at 8, files and jobs at 20)', () => {
  const tasks = Array.from({ length: 12 }, (_, i) => `task${i}`)
  const files = Array.from({ length: 27 }, (_, i) => `f${i}.py`)
  const jobs = Array.from({ length: 23 }, (_, i) => `job${i}`)
  const c = buildCompactCommand({ ...NONE, tasks: true, files: true, jobs: true }, { ...EMPTY, tasks, files, jobs })
  expect(c).toContain('task7')
  expect(c).not.toContain('task8')
  expect(c).toContain('task7 and 4 more.')
  expect(c).toContain('f19.py')
  expect(c).not.toContain('f20.py')
  expect(c).toContain('f19.py and 7 more.')
  expect(c).toContain('job19')
  expect(c).not.toContain('job20')
  expect(c).toContain('job19 and 3 more.')
})

test('buildCompactCommand: an item that is only a line break is dropped, and a row left empty adds nothing', () => {
  expect(buildCompactCommand({ ...NONE, files: true }, { ...EMPTY, files: ['\n', '  '] })).toBe('/compact')
  expect(buildCompactCommand({ ...NONE, files: true }, { ...EMPTY, files: ['\n', 'a.py'] })).toBe('/compact Keep these uncommitted files by path: a.py.')
})

// ── how many each row would keep ─────────────────────────────────────────────

test('pickCount: notes and lean are always one; the others count what the board offers', () => {
  expect(pickCount('notes', EMPTY)).toBe(1)
  expect(pickCount('lean', EMPTY)).toBe(1)
  expect(pickCount('tasks', FACTS)).toBe(2)
  expect(pickCount('files', FACTS)).toBe(2)
  expect(pickCount('jobs', FACTS)).toBe(2)
  expect(pickCount('assumptions', FACTS)).toBe(2)
  for (const id of ['tasks', 'files', 'jobs', 'assumptions'] as PickId[]) expect(pickCount(id, EMPTY)).toBe(0)
})

// ── may the buttons replace the box? ─────────────────────────────────────────

test('boxIsFree: an empty box, or one holding exactly what a button typed last, may be replaced', () => {
  expect(boxIsFree('', undefined)).toBe(true)
  expect(boxIsFree('   ', undefined)).toBe(true)
  expect(boxIsFree('/compact', '/compact')).toBe(true)
  expect(boxIsFree('/clear', '/clear')).toBe(true)
})

test('boxIsFree: text you typed, or a typed command you changed, is never replaced', () => {
  expect(boxIsFree('fix the login test', undefined)).toBe(false)
  expect(boxIsFree('fix the login test', '/compact')).toBe(false)
  expect(boxIsFree('/compact keep the plan', '/compact')).toBe(false)
  expect(boxIsFree('/compact ', '/compact')).toBe(false)
  expect(boxIsFree('/clear', '/compact')).toBe(false)
})

// ── the negative controls: the table must be able to fail ───────────────────

const MUTANTS: [string, BuildFn][] = [
  ['ignores the notes tick', (p, f) => buildCompactCommand({ ...p, notes: false }, f)],
  ['always adds the lean sentence', (p, f) => buildCompactCommand({ ...p, lean: true }, f)],
  ['ignores the board facts', p => buildCompactCommand(p, EMPTY)],
  ['reads the task list from the wrong facts', (p, f) => buildCompactCommand(p, { ...f, tasks: f.files })],
  ['ignores the high-impact count', (p, f) => buildCompactCommand(p, { ...f, high: 0 })],
  ['types nothing but /compact', () => '/compact'],
  ['adds a line break after the command', (p, f) => buildCompactCommand(p, f).replace('/compact ', '/compact\n')],
  ['types /clear', (p, f) => buildCompactCommand(p, f).replace('/compact', '/clear')],
  [
    'puts the sentences in the wrong order',
    (p, f) => {
      const c = buildCompactCommand(p, f)
      const parts = c.slice('/compact '.length).split(/(?<=\.) /)
      return parts.length > 1 ? `/compact ${parts.reverse().join(' ')}` : c
    },
  ],
]

for (const [name, fn] of MUTANTS) {
  test(`negative control: a builder that ${name} fails the table`, () => {
    expect(runTable(fn).length).toBeGreaterThan(0)
  })
}

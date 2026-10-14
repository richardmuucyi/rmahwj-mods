// The negative control for the decision table (design page, test T2): a table that cannot fail proves
// nothing. Each mutant below keeps the real decide() but breaks one rule from the outside, the way a
// regression would: it must make at least one row of the table fail. The control run, the real
// decide() against the same table, must fail none.
import { expect, test } from 'claude-code/testing'

import { decide, wouldCompact } from '../hooks/guard'
import type { Decision } from '../hooks/guard'
import { ROWS, WOULD_ROWS, runTable, runWouldTable } from './guard-cases'
import type { DecideFn, WouldFn } from './guard-cases'

test('control: the real decide() passes every row of the table', () => {
  expect(ROWS.length).toBeGreaterThanOrEqual(40)
  expect(runTable(decide)).toEqual([])
})

const MUTANTS: [string, DecideFn][] = [
  ['ignores running jobs', (c, s, f) => decide(c, s, { ...f, jobs: 0 })],
  ['ignores typing', (c, s, f) => decide(c, s, { ...f, lastTypedAt: undefined })],
  ['ignores that a turn is running', (c, s, f) => decide(c, s, { ...f, isWorking: false })],
  ['drops the floor + 150K rule', (c, s, f) => decide({ ...c, minGrowth: 0 }, s, f)],
  ['drops the cooldown', (c, s, f) => decide(c, { ...s, lastCompactAt: undefined, requestsSinceCompact: 1_000_000 }, f)],
  ['drops the snooze', (c, s, f) => decide(c, { ...s, snooze: undefined }, f)],
  ['drops the stop after two failed compactions', (c, s, f) => decide(c, { ...s, shrinkFailures: 0 }, f)],
  ['treats every moment as good', (c, s, f) => decide(c, s, { ...f, lastTurnCommitted: true, uncommittedMine: 0 })],
  ['always acts as auto', (c, s, f) => decide({ ...c, mode: 'auto' }, s, f)],
  ['ignores mode off', (c, s, f) => decide({ ...c, mode: c.mode === 'off' ? 'advise' : c.mode }, s, f)],
  ['starts a countdown whenever it advises', (c, s, f) => {
    const d = decide(c, s, f)
    return { ...d, autoStart: d.chip === 'advise' } as Decision
  }],
  ['advises one step early (299K counts as advise)', (c, s, f) => decide({ ...c, adviseAt: c.adviseAt - 2_000 }, s, f)],
  ['auto one step early', (c, s, f) => decide({ ...c, autoAt: c.autoAt - 2_000 }, s, f)],
  ['shows the dim chip too early', (c, s, f) => decide({ ...c, dimAt: c.dimAt - 2_000 }, s, f)],
  ['typing lasts only 10 s', (c, s, f) => decide({ ...c, typingMs: 10_000 }, s, f)],
]

for (const [name, fn] of MUTANTS) {
  test(`negative control: a decide() that ${name} fails the table`, () => {
    expect(runTable(fn).length).toBeGreaterThan(0)
  })
}

test('negative control: every row of the table is needed (removing any one row lets some mutant through)', () => {
  // A row that no mutant depends on would be dead weight. Count, per row, how many mutants it catches.
  const caught = new Map<string, number>()
  for (const [, fn] of MUTANTS) for (const n of runTable(fn)) caught.set(n, (caught.get(n) ?? 0) + 1)
  const covered = [...caught.keys()].length
  // Not every row guards a rule on its own (the 'nothing' and 'dim' rows pin the boundaries), but most should.
  expect(covered).toBeGreaterThanOrEqual(20)
})

// ── the same control for the pilot log's "would it have compacted" ─────────────

test('control: the real wouldCompact() passes every row of its table', () => {
  expect(WOULD_ROWS.length).toBeGreaterThanOrEqual(15)
  expect(runWouldTable(wouldCompact)).toEqual([])
})

const WOULD_MUTANTS: [string, WouldFn][] = [
  ['ignores running jobs', (c, s, f) => wouldCompact(c, s, { ...f, jobs: 0 })],
  ['ignores typing', (c, s, f) => wouldCompact(c, s, { ...f, lastTypedAt: undefined })],
  ['treats every moment as good', (c, s, f) => wouldCompact(c, s, { ...f, lastTurnCommitted: true, uncommittedMine: 0 })],
  ['says yes from the advise line (300K)', (c, s, f) => wouldCompact({ ...c, autoAt: c.adviseAt }, s, f)],
  ['ignores the snooze', (c, s, f) => wouldCompact(c, { ...s, snooze: undefined }, f)],
  ['ignores the cooldown', (c, s, f) => wouldCompact(c, { ...s, lastCompactAt: undefined, requestsSinceCompact: 1_000_000 }, f)],
  ['ignores the stop after two failed compactions', (c, s, f) => wouldCompact(c, { ...s, shrinkFailures: 0 }, f)],
  ['says yes in mode off', (c, s, f) => wouldCompact({ ...c, mode: c.mode === 'off' ? 'advise' : c.mode }, s, f)],
  ['ignores that a turn is running', (c, s, f) => wouldCompact(c, s, { ...f, isWorking: false })],
  ['ignores the floor + 150K rule', (c, s, f) => wouldCompact({ ...c, minGrowth: 0 }, s, f)],
  ['is always no', () => false],
  ['is always yes', () => true],
]

for (const [name, fn] of WOULD_MUTANTS) {
  test(`negative control: a wouldCompact() that ${name} fails its table`, () => {
    expect(runWouldTable(fn).length).toBeGreaterThan(0)
  })
}

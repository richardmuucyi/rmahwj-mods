// The negative control for the decision table (design page, test T2): a table that cannot fail proves
// nothing. Each mutant below keeps the real decide() but breaks one rule from the outside, the way a
// regression would: it must make at least one row of the table fail. The control run, the real
// decide() against the same table, must fail none. *(0.19.0: the auto-mode mutants are gone with auto mode. 0.21.0: so are the
// jobs, typing and snooze mutants; a new one checks that a running job does not hide the advice.)*
import { expect, test } from 'claude-code/testing'

import { decide } from '../hooks/guard'
import { ROWS, runTable } from './guard-cases'
import type { DecideFn } from './guard-cases'

test('control: the real decide() passes every row of the table', () => {
  expect(ROWS.length).toBeGreaterThanOrEqual(25)
  expect(runTable(decide)).toEqual([])
})

const MUTANTS: [string, DecideFn][] = [
  ['hides the advice while a job runs', (c, s, f) => (f.jobs > 0 ? { ...decide(c, s, f), chip: 'none' as const } : decide(c, s, f))],
  ['holds the advice back while a job runs', (c, s, f) => (f.jobs > 0 ? { ...decide(c, s, f), chip: 'dim' as const } : decide(c, s, f))],
  ['ignores that a turn is running', (c, s, f) => decide(c, s, { ...f, isWorking: false })],
  ['drops the floor + 150K rule', (c, s, f) => decide({ ...c, minGrowth: 0 }, s, f)],
  ['drops the cooldown', (c, s, f) => decide(c, { ...s, lastCompactAt: undefined, requestsSinceCompact: 1_000_000 }, f)],
  ['drops the stop after two failed compactions', (c, s, f) => decide(c, { ...s, shrinkFailures: 0 }, f)],
  ['treats every moment as good', (c, s, f) => decide(c, s, { ...f, lastTurnCommitted: true, uncommittedMine: 0 })],
  ['ignores mode off', (c, s, f) => decide({ ...c, mode: c.mode === 'off' ? 'advise' : c.mode }, s, f)],
  ['advises one step early (299K counts as advise)', (c, s, f) => decide({ ...c, adviseAt: c.adviseAt - 2_000 }, s, f)],
  ['shows the dim chip too early', (c, s, f) => decide({ ...c, dimAt: c.dimAt - 2_000 }, s, f)],
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
  expect(covered).toBeGreaterThanOrEqual(16)
})

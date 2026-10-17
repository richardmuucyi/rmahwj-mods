// The decision table for the context guard (design page, section 2, 3 and 9). Shared by guard.test.ts,
// which runs it against the real decide(), and guard.mutation.test.ts, which runs it against broken
// copies to prove the table can fail. *(0.19.0: auto mode and its rows are gone; the guard only advises. 0.21.0: the held and snoozed
// chips and their rows are gone too: background jobs and typing no longer hold the advice back.)*
import type { Decision, GuardConfig, GuardState, TurnFacts } from '../hooks/guard'

export type DecideFn = (cfg: GuardConfig, st: GuardState, f: TurnFacts) => Decision

export type Row = {
  name: string
  cfg?: Partial<GuardConfig>
  st?: Partial<GuardState>
  f?: Partial<TurnFacts>
  /** Only these fields of the decision are compared. */
  want: { chip: Decision['chip']; grade?: Decision['grade']; reason?: string }
}

export const NOW = 10_000_000
const MIN = 60_000

/** The design's numbers, written out so a change to DEFAULTS cannot move the table with it. */
export const CFG: GuardConfig = {
  mode: 'advise',
  dimAt: 200_000,
  adviseAt: 300_000,
  minGrowth: 150_000,
  cooldownRequests: 8,
  cooldownMs: 20 * MIN,
}

export const ST: GuardState = { floor: 125_000, requestsSinceCompact: 1_000_000, shrinkFailures: 0 }

/** A turn that ended right after a commit, nothing of this session uncommitted, nothing running. */
export const F: TurnFacts = {
  now: NOW,
  ctx: 312_000,
  isWorking: false,
  jobs: 0,
  lastTurnCommitted: true,
  uncommittedMine: 0,
}

export const ROWS: Row[] = [
  // Below the chip
  { name: 'mode off: nothing at 600K', cfg: { mode: 'off' }, f: { ctx: 600_000 }, want: { chip: 'none' } },
  { name: 'a turn is running: nothing, whatever the size', f: { ctx: 600_000, isWorking: true }, want: { chip: 'none' } },
  { name: '150K: nothing', f: { ctx: 150_000 }, want: { chip: 'none' } },
  { name: '199,999: nothing', f: { ctx: 199_999 }, want: { chip: 'none' } },
  // The dim chip
  { name: '200K: dim', f: { ctx: 200_000 }, want: { chip: 'dim' } },
  { name: '212K: dim', f: { ctx: 212_000 }, want: { chip: 'dim' } },
  { name: '299,999: still dim, no button', f: { ctx: 299_999 }, want: { chip: 'dim' } },
  // The advise chip and its grade
  { name: '300K, just committed: advise, good', f: { ctx: 300_000 }, want: { chip: 'advise', grade: 'good' } },
  { name: '312K with uncommitted files: advise, ok', f: { lastTurnCommitted: false, uncommittedMine: 3 }, want: { chip: 'advise', grade: 'ok' } },
  { name: '312K, committed but a file is uncommitted: ok, not good', f: { uncommittedMine: 1 }, want: { chip: 'advise', grade: 'ok' } },
  { name: '312K, nothing uncommitted but no commit this turn: ok', f: { lastTurnCommitted: false }, want: { chip: 'advise', grade: 'ok' } },
  // Background jobs do not hold the advice back (0.21.0): the strip says they are running, and that is all
  { name: '312K with 2 jobs running: still advise (the strip says so)', f: { jobs: 2 }, want: { chip: 'advise', grade: 'good' } },
  { name: 'one job changes nothing either', f: { jobs: 1, lastTurnCommitted: false }, want: { chip: 'advise', grade: 'ok' } },
  // Big contexts only advise: the mod never starts anything by itself
  { name: 'even at 700K it only advises', f: { ctx: 700_000 }, want: { chip: 'advise', grade: 'good' } },
  // Floor + 150K
  { name: 'floor 400K, 450K: dim (growth 50K)', st: { floor: 400_000 }, f: { ctx: 450_000 }, want: { chip: 'dim', reason: 'growth' } },
  { name: 'floor 400K, 549,999: dim', st: { floor: 400_000 }, f: { ctx: 549_999 }, want: { chip: 'dim', reason: 'growth' } },
  { name: 'floor 400K, 550K: advise', st: { floor: 400_000 }, f: { ctx: 550_000 }, want: { chip: 'advise', grade: 'good' } },
  { name: 'floor 250K, 450K: advise (the advise line moved up to 400K, 450K is past it)', st: { floor: 250_000 }, f: { ctx: 450_000 }, want: { chip: 'advise', grade: 'good' } },
  { name: 'floor 250K, 399,999: dim (advise line moved up to 400K)', st: { floor: 250_000 }, f: { ctx: 399_999 }, want: { chip: 'dim', reason: 'growth' } },
  // Cooldown
  { name: 'compacted 10 min ago: no advice at 560K', st: { lastCompactAt: NOW - 10 * MIN }, f: { ctx: 560_000 }, want: { chip: 'dim', reason: 'cooldown' } },
  { name: 'compacted 19.9 min ago: still cooling', st: { lastCompactAt: NOW - 19.9 * MIN }, f: { ctx: 560_000 }, want: { chip: 'dim', reason: 'cooldown' } },
  { name: 'compacted 21 min ago, 8 requests: advice again', st: { lastCompactAt: NOW - 21 * MIN, requestsSinceCompact: 8 }, f: { ctx: 560_000 }, want: { chip: 'advise' } },
  { name: '5 requests since a compaction: cooling even after 21 min', st: { lastCompactAt: NOW - 21 * MIN, requestsSinceCompact: 5 }, f: { ctx: 560_000 }, want: { chip: 'dim', reason: 'cooldown' } },
  { name: '7 requests since: cooling; 8 is the line', st: { requestsSinceCompact: 7 }, f: { ctx: 560_000 }, want: { chip: 'dim', reason: 'cooldown' } },
  // Stopped
  { name: 'two compactions that did not shrink: stopped, says why', st: { shrinkFailures: 2 }, f: { ctx: 600_000 }, want: { chip: 'stopped' } },
  { name: 'one failure is not enough to stop', st: { shrinkFailures: 1 }, f: { ctx: 600_000 }, want: { chip: 'advise' } },
  { name: 'stopped below the advise line is only dim', st: { shrinkFailures: 2 }, f: { ctx: 250_000 }, want: { chip: 'dim' } },
]

/** Names of the rows whose answer differs from the table's. Empty when the function keeps every rule. */
export function runTable(decide: DecideFn): string[] {
  const bad: string[] = []
  for (const r of ROWS) {
    const d = decide({ ...CFG, ...r.cfg }, { ...ST, ...r.st }, { ...F, ...r.f })
    const w = r.want
    if (d.chip !== w.chip || (w.grade !== undefined && d.grade !== w.grade) || (w.reason !== undefined && d.reason !== w.reason)) bad.push(r.name)
  }
  return bad
}

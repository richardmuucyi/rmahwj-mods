// The decision table for the context guard (design page, section 2, 3 and 9). Shared by guard.test.ts,
// which runs it against the real decide(), and guard.mutation.test.ts, which runs it against broken
// copies to prove the table can fail.
import type { Decision, GuardConfig, GuardState, TurnFacts } from '../hooks/guard'

export type DecideFn = (cfg: GuardConfig, st: GuardState, f: TurnFacts) => Decision
export type WouldFn = (cfg: GuardConfig, st: GuardState, f: TurnFacts) => boolean

export type Row = {
  name: string
  cfg?: Partial<GuardConfig>
  st?: Partial<GuardState>
  f?: Partial<TurnFacts>
  /** Only these fields of the decision are compared. */
  want: { chip: Decision['chip']; grade?: Decision['grade']; autoStart?: boolean; reason?: string }
}

export const NOW = 10_000_000
const MIN = 60_000

/** The design's numbers, written out so a change to DEFAULTS cannot move the table with it. */
export const CFG: GuardConfig = {
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
  { name: 'mode off: nothing at 600K', cfg: { mode: 'off' }, f: { ctx: 600_000 }, want: { chip: 'none', autoStart: false } },
  { name: 'a turn is running: nothing, whatever the size', cfg: { mode: 'auto' }, f: { ctx: 600_000, isWorking: true }, want: { chip: 'none', autoStart: false } },
  { name: '150K: nothing', f: { ctx: 150_000 }, want: { chip: 'none' } },
  { name: '199,999: nothing', f: { ctx: 199_999 }, want: { chip: 'none' } },
  // The dim chip
  { name: '200K: dim', f: { ctx: 200_000 }, want: { chip: 'dim', autoStart: false } },
  { name: '212K: dim', f: { ctx: 212_000 }, want: { chip: 'dim' } },
  { name: '299,999: still dim, no button', f: { ctx: 299_999 }, want: { chip: 'dim', autoStart: false } },
  // The advise chip and its grade
  { name: '300K, just committed: advise, good', f: { ctx: 300_000 }, want: { chip: 'advise', grade: 'good', autoStart: false } },
  { name: '312K with uncommitted files: advise, ok', f: { lastTurnCommitted: false, uncommittedMine: 3 }, want: { chip: 'advise', grade: 'ok', autoStart: false } },
  { name: '312K, committed but a file is uncommitted: ok, not good', f: { uncommittedMine: 1 }, want: { chip: 'advise', grade: 'ok' } },
  { name: '312K, nothing uncommitted but no commit this turn: ok', f: { lastTurnCommitted: false }, want: { chip: 'advise', grade: 'ok' } },
  // Hold
  { name: '312K with 2 jobs running: held (jobs)', f: { jobs: 2 }, want: { chip: 'held', grade: 'hold', reason: 'jobs', autoStart: false } },
  { name: 'one job is enough to hold', f: { jobs: 1 }, want: { chip: 'held', reason: 'jobs' } },
  { name: '312K, typed 5 s ago: held (typing)', f: { lastTypedAt: NOW - 5_000 }, want: { chip: 'held', grade: 'hold', reason: 'typing' } },
  { name: 'typed 19.9 s ago: still held', f: { lastTypedAt: NOW - 19_900 }, want: { chip: 'held', reason: 'typing' } },
  { name: 'typed 20 s ago: advise again', f: { lastTypedAt: NOW - 20_000 }, want: { chip: 'advise', grade: 'good' } },
  { name: 'jobs outrank typing in the reason', f: { jobs: 1, lastTypedAt: NOW - 1_000 }, want: { chip: 'held', reason: 'jobs' } },
  // Auto
  { name: 'advise mode never starts a countdown, even at 700K', f: { ctx: 700_000 }, want: { chip: 'advise', grade: 'good', autoStart: false } },
  { name: 'auto at 499,999: advise only', cfg: { mode: 'auto' }, f: { ctx: 499_999 }, want: { chip: 'advise', autoStart: false } },
  { name: 'auto at 500K, good moment: starts', cfg: { mode: 'auto' }, f: { ctx: 500_000 }, want: { chip: 'advise', grade: 'good', autoStart: true } },
  { name: 'auto at 555K with 2 jobs: held, no start', cfg: { mode: 'auto' }, f: { ctx: 555_000, jobs: 2 }, want: { chip: 'held', autoStart: false } },
  { name: 'auto at 555K, ok moment (uncommitted): advise, no start', cfg: { mode: 'auto' }, f: { ctx: 555_000, lastTurnCommitted: false, uncommittedMine: 2 }, want: { chip: 'advise', grade: 'ok', autoStart: false } },
  { name: 'auto at 555K, typing: held, no start', cfg: { mode: 'auto' }, f: { ctx: 555_000, lastTypedAt: NOW - 2_000 }, want: { chip: 'held', autoStart: false } },
  // Floor + 150K
  { name: 'floor 400K, 450K: dim (growth 50K)', st: { floor: 400_000 }, f: { ctx: 450_000 }, want: { chip: 'dim', reason: 'growth', autoStart: false } },
  { name: 'floor 400K, 549,999: dim', st: { floor: 400_000 }, f: { ctx: 549_999 }, want: { chip: 'dim', reason: 'growth' } },
  { name: 'floor 400K, 550K: advise', st: { floor: 400_000 }, f: { ctx: 550_000 }, want: { chip: 'advise', grade: 'good' } },
  { name: 'floor 400K, auto at 549,999: dim', cfg: { mode: 'auto' }, st: { floor: 400_000 }, f: { ctx: 549_999 }, want: { chip: 'dim', autoStart: false } },
  { name: 'floor 400K, auto at 550K: starts (the auto line moves up with the floor)', cfg: { mode: 'auto' }, st: { floor: 400_000 }, f: { ctx: 550_000 }, want: { chip: 'advise', autoStart: true } },
  { name: 'floor 250K, auto at 450K: advise only (advise line 400K, auto line 500K)', cfg: { mode: 'auto' }, st: { floor: 250_000 }, f: { ctx: 450_000 }, want: { chip: 'advise', grade: 'good', autoStart: false } },
  { name: 'floor 250K, auto at 399,999: dim (advise line moved up to 400K)', cfg: { mode: 'auto' }, st: { floor: 250_000 }, f: { ctx: 399_999 }, want: { chip: 'dim', reason: 'growth' } },
  { name: 'floor 250K, auto at 500K: starts', cfg: { mode: 'auto' }, st: { floor: 250_000 }, f: { ctx: 500_000 }, want: { chip: 'advise', autoStart: true } },
  // Cooldown
  { name: 'compacted 10 min ago: no advice at 560K', st: { lastCompactAt: NOW - 10 * MIN }, f: { ctx: 560_000 }, want: { chip: 'dim', reason: 'cooldown', autoStart: false } },
  { name: 'compacted 19.9 min ago: still cooling', st: { lastCompactAt: NOW - 19.9 * MIN }, f: { ctx: 560_000 }, want: { chip: 'dim', reason: 'cooldown' } },
  { name: 'compacted 21 min ago, 8 requests: advice again', st: { lastCompactAt: NOW - 21 * MIN, requestsSinceCompact: 8 }, f: { ctx: 560_000 }, want: { chip: 'advise' } },
  { name: '5 requests since a compaction: cooling even after 21 min', st: { lastCompactAt: NOW - 21 * MIN, requestsSinceCompact: 5 }, f: { ctx: 560_000 }, want: { chip: 'dim', reason: 'cooldown' } },
  { name: '7 requests since: cooling; 8 is the line', st: { requestsSinceCompact: 7 }, f: { ctx: 560_000 }, want: { chip: 'dim', reason: 'cooldown' } },
  { name: 'auto does not start while cooling', cfg: { mode: 'auto' }, st: { lastCompactAt: NOW - 5 * MIN }, f: { ctx: 700_000 }, want: { chip: 'dim', autoStart: false } },
  // Snooze: quiet until context grew 100K AND 30 minutes passed
  { name: 'snoozed at 312K, 10 min left, 330K: snoozed', st: { snooze: { ctx: 312_000, until: NOW + 10 * MIN } }, f: { ctx: 330_000 }, want: { chip: 'snoozed', autoStart: false } },
  { name: 'snoozed: grew 100K but time left: still snoozed', st: { snooze: { ctx: 312_000, until: NOW + 10 * MIN } }, f: { ctx: 412_000 }, want: { chip: 'snoozed' } },
  { name: 'snoozed: time is up but growth is only 40K: still snoozed', st: { snooze: { ctx: 312_000, until: NOW - 1 } }, f: { ctx: 352_000 }, want: { chip: 'snoozed' } },
  { name: 'snoozed: both done: advice again', st: { snooze: { ctx: 312_000, until: NOW - 1 } }, f: { ctx: 412_000 }, want: { chip: 'advise', grade: 'good' } },
  { name: 'auto does not start while snoozed', cfg: { mode: 'auto' }, st: { snooze: { ctx: 520_000, until: NOW + 10 * MIN } }, f: { ctx: 560_000 }, want: { chip: 'snoozed', autoStart: false } },
  // Stopped
  { name: 'two compactions that did not shrink: stopped, says why', st: { shrinkFailures: 2 }, f: { ctx: 600_000 }, want: { chip: 'stopped', autoStart: false } },
  { name: 'stopped also blocks auto', cfg: { mode: 'auto' }, st: { shrinkFailures: 3 }, f: { ctx: 700_000 }, want: { chip: 'stopped', autoStart: false } },
  { name: 'one failure is not enough to stop', st: { shrinkFailures: 1 }, f: { ctx: 600_000 }, want: { chip: 'advise' } },
  { name: 'stopped below the advise line is only dim', st: { shrinkFailures: 2 }, f: { ctx: 250_000 }, want: { chip: 'dim' } },
]

/** Names of the rows whose answer differs from the table's. Empty when the function keeps every rule. */
export function runTable(decide: DecideFn): string[] {
  const bad: string[] = []
  for (const r of ROWS) {
    const d = decide({ ...CFG, ...r.cfg }, { ...ST, ...r.st }, { ...F, ...r.f })
    const w = r.want
    if (
      d.chip !== w.chip ||
      (w.grade !== undefined && d.grade !== w.grade) ||
      (w.autoStart !== undefined && d.autoStart !== w.autoStart) ||
      (w.reason !== undefined && d.reason !== w.reason)
    )
      bad.push(r.name)
  }
  return bad
}

// ── would it have compacted by itself? The pilot log answers this at every turn end, whatever the mode ──

export type WouldRow = { name: string; cfg?: Partial<GuardConfig>; st?: Partial<GuardState>; f?: Partial<TurnFacts>; want: boolean }

export const WOULD_ROWS: WouldRow[] = [
  { name: 'advise mode, 512K, good moment: yes (as if auto were on)', f: { ctx: 512_000 }, want: true },
  { name: 'advise mode, 499,999: no', f: { ctx: 499_999 }, want: false },
  { name: 'advise mode, exactly 500K: yes', f: { ctx: 500_000 }, want: true },
  { name: 'auto mode, 512K, good: yes, same as the countdown', cfg: { mode: 'auto' }, f: { ctx: 512_000 }, want: true },
  { name: 'a job is running: no', f: { ctx: 600_000, jobs: 1 }, want: false },
  { name: 'you are typing: no', f: { ctx: 600_000, lastTypedAt: NOW - 3_000 }, want: false },
  { name: 'not a good moment (uncommitted work): no', f: { ctx: 600_000, lastTurnCommitted: false, uncommittedMine: 2 }, want: false },
  { name: 'not a good moment (no commit this turn): no', f: { ctx: 600_000, lastTurnCommitted: false }, want: false },
  { name: 'snoozed: no', st: { snooze: { ctx: 520_000, until: NOW + 10 * MIN } }, f: { ctx: 560_000 }, want: false },
  { name: 'cooling after a compaction: no', st: { lastCompactAt: NOW - 5 * MIN }, f: { ctx: 700_000 }, want: false },
  { name: 'stopped after two failed compactions: no', st: { shrinkFailures: 2 }, f: { ctx: 700_000 }, want: false },
  { name: 'mode off: never, even at 700K', cfg: { mode: 'off' }, f: { ctx: 700_000 }, want: false },
  { name: 'a turn is running: no', f: { ctx: 700_000, isWorking: true }, want: false },
  { name: 'floor 400K, 549,999: no (floor + 150K is the line)', st: { floor: 400_000 }, f: { ctx: 549_999 }, want: false },
  { name: 'floor 400K, 550K: yes', st: { floor: 400_000 }, f: { ctx: 550_000 }, want: true },
  { name: 'below the dim chip: no', f: { ctx: 150_000 }, want: false },
]

/** Names of the rows where the function's yes or no differs from the table's. */
export function runWouldTable(would: WouldFn): string[] {
  const bad: string[] = []
  for (const r of WOULD_ROWS) if (would({ ...CFG, ...r.cfg }, { ...ST, ...r.st }, { ...F, ...r.f }) !== r.want) bad.push(r.name)
  return bad
}

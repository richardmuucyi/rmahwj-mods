import type { Git } from '../types'

// The git slots and the options, with no engine in them: what `git status` said as the counts, the counts as the slots,
// which row-1 items the person chose, and how wide the pane must be for each. register.tsx runs git and draws.

/**
 * `git status --porcelain=v2 --branch`, read into the branch and the counts. Undefined when the text is not that output
 * (no `# branch.oid` header, which git prints even in a repository with no commit). `# branch.ab` is printed only while
 * the branch tracks a remote branch that exists, so its absence is "no upstream". `# branch.head` is the branch's name,
 * or "(detached)", and then the commit's short hash stands in for the name.
 */
export function parseStatus(text: string): Git | undefined {
  let header = false
  let oid = ''
  let head = ''
  let upstream = false
  let ahead = 0
  let behind = 0
  let changed = 0
  let conflicts = 0
  let untracked = 0
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('# branch.oid ')) {
      header = true
      oid = line.slice('# branch.oid '.length).trim()
    } else if (line.startsWith('# branch.head ')) head = line.slice('# branch.head '.length).trim()
    else if (line.startsWith('# branch.ab ')) {
      const m = /^# branch\.ab \+(\d+) -(\d+)/.exec(line)
      if (m) {
        upstream = true
        ahead = Number(m[1])
        behind = Number(m[2])
      }
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) changed++
    else if (line.startsWith('u ')) conflicts++
    else if (line.startsWith('? ')) untracked++
  }
  if (!header) return undefined
  const detached = head === '(detached)'
  const branch = detached ? (oid.startsWith('(') ? '' : oid.slice(0, 7)) : head
  return { branch, ...(detached ? { detached } : {}), upstream, ahead, behind, changed, conflicts, untracked }
}

/** A count as drawn: three characters at most. */
export const cap = (n: number): string => (n > 99 ? '99+' : String(n))

/** A branch name in at most `room` cells: cut short with "…" when it is longer. Nothing when there is no room. */
export function clip(name: string, room: number): string {
  const chars = [...name]
  if (room < 1) return ''
  return chars.length <= room ? name : chars.slice(0, room - 1).join('') + '…'
}

/** One slot. No colour and not dim: a count that is lit. */
export type Slot = {
  key: 'behind' | 'changed' | 'untracked' | 'ahead'
  text: string
  /** The theme key the slot is drawn in. */
  color?: 'warning' | 'error'
  dim?: boolean
}

/**
 * The slots, left to right: ↓ commits to pull, ± files to commit, ? files git does not know, ↑ commits to push. A zero
 * is dim, a count is lit. The remote's news is old or missing in three cases, each drawn so it is never read as "none":
 * "↓?" when the last fetch failed, a dash for ↓ and ↑ when the branch tracks nothing. A branch that is both behind and
 * ahead has diverged: both arrows in the theme's error. A conflicted file puts ± in error. Untracked files are their own
 * dim slot, only when there are some, and only where the pane has room for it.
 */
export function slotsOf(g: Git, withUntracked: boolean): Slot[] {
  // A stale ↓ is not known to be above zero, so the branch is not called diverged on its word.
  const diverged = g.upstream && !g.stale && g.ahead > 0 && g.behind > 0
  const behind: Slot = !g.upstream
    ? { key: 'behind', text: '↓–', dim: true }
    : g.stale
      ? { key: 'behind', text: '↓?', dim: true }
      : g.behind === 0
        ? { key: 'behind', text: '↓0', dim: true }
        : { key: 'behind', text: `↓${cap(g.behind)}`, color: diverged ? 'error' : 'warning' }
  const files = g.changed + g.conflicts
  const changed: Slot =
    g.conflicts > 0
      ? { key: 'changed', text: `±${cap(files)}`, color: 'error' }
      : files === 0
        ? { key: 'changed', text: '±0', dim: true }
        : { key: 'changed', text: `±${cap(files)}` }
  const ahead: Slot = !g.upstream
    ? { key: 'ahead', text: '↑–', dim: true }
    : g.ahead === 0
      ? { key: 'ahead', text: '↑0', dim: true }
      : { key: 'ahead', text: `↑${cap(g.ahead)}`, ...(diverged ? { color: 'error' as const } : {}) }
  const untracked: Slot[] = withUntracked && g.untracked > 0 ? [{ key: 'untracked', text: `?${cap(g.untracked)}`, dim: true }] : []
  return [behind, changed, ...untracked, ahead]
}

/** Which of the optional row-1 items the person wants, and whether to fetch. Anything but an explicit false is on. */
export type Show = { time: boolean; cost: boolean; speed: boolean; tokens: boolean; git: boolean; cache: boolean; fetch: boolean }

export function showOf(options: Readonly<Record<string, unknown>>): Show {
  const on = (v: unknown): boolean => v !== false
  return {
    time: on(options.showTime),
    cost: on(options.showCost),
    speed: on(options.showSpeed),
    tokens: on(options.showTokens),
    git: on(options.showGit),
    cache: on(options.showCache),
    fetch: on(options.fetchRemote),
  }
}

/**
 * Below this many columns the rows use short labels and drop the token counts and the weekly reset. The widest wide row,
 * every item at its longest, is 113 cells (tests/width.test.tsx measures it), and a row wider than the surface wraps a
 * meter or the cache chip onto a third line. 115 leaves 2 to spare.
 */
export const NARROW_BELOW = 115

/**
 * With the git slots on the row, row 1 at its longest (the clock chip showing "cold", every count at 99+, the model and
 * effort longest) is this many cells BEFORE the branch name: 80 in a narrow pane, 101 in a wide one, 120 in a wide one
 * with the token counts. The branch name is the flexible item. It takes the room that is left, 2 cells to spare, up to
 * BRANCH_MAX, and a pane with less than BRANCH_MIN cells for it draws none. The token counts give way to the git slots:
 * they wait for TOKENS_FROM columns, the 120 plus the 2 to spare plus a branch of 8 (and its space). The untracked slot
 * needs no wait: every wide pane has room for it. tests/width.test.tsx measures all of these on the drawn rows.
 */
const FIXED_NARROW = 80
const FIXED_WIDE = 101
const FIXED_WIDE_TOKENS = 120
const SPARE = 2
export const BRANCH_MAX = 16
export const BRANCH_MIN = 4
export const TOKENS_FROM = FIXED_WIDE_TOKENS + SPARE + 1 + 8

export type Layout = {
  narrow: boolean
  tokens: boolean
  untracked: boolean
  /** Cells the branch name may take; 0: none is drawn. */
  branch: number
}

/**
 * What the pane has room for. `columns` is the surface's own measure; none, or 0, is a surface that has not measured and
 * is drawn in full. `git` is whether the slots are on the row at all: without them nothing gives way, so the thresholds
 * are the ones the gauge had before the slots (narrow below 115, tokens in every wide row).
 */
export function layoutOf(columns: number | undefined, git: boolean, tokens: boolean): Layout {
  const known = columns !== undefined && columns > 0
  const narrow = known && columns < NARROW_BELOW
  const withTokens = tokens && !narrow && (!git || !known || columns >= TOKENS_FROM)
  const fixed = narrow ? FIXED_NARROW : withTokens ? FIXED_WIDE_TOKENS : FIXED_WIDE
  const room = known ? Math.min(BRANCH_MAX, columns - SPARE - fixed - 1) : BRANCH_MAX
  return { narrow, tokens: withTokens, untracked: !narrow, branch: room >= BRANCH_MIN ? room : 0 }
}

/** One usage limit window as the session reports it. */
export type Limit = {
  pct: number
  resetsAt?: string
  /** An estimate, drawn with a "~". */
  approx?: boolean
  /** Tokens held, drawn after the percent (the context meter only). */
  tokens?: number
}

/** The repository the session sits in, as `git status` and the last fetch left it. */
export type Git = {
  /** The branch's name; for a detached HEAD, the commit's short hash. Empty: git did not say. */
  branch: string
  /** HEAD is on a commit, not on a branch. */
  detached?: boolean
  /** The branch tracks a remote branch: ahead and behind mean something. */
  upstream: boolean
  /** Commits here that the remote branch lacks. */
  ahead: number
  /** Commits on the remote branch that are not here, as of the last fetch. */
  behind: number
  /** Tracked files staged or modified; a conflicted file is counted in `conflicts`, not here. */
  changed: number
  /** Files with an unresolved merge conflict. */
  conflicts: number
  /** Files git neither tracks nor ignores; a folder of them counts as one. */
  untracked: number
  /** The last fetch failed: `behind` is old news, drawn as a question mark. */
  stale?: boolean
}

/** Everything the two rows draw. */
export type Gauge = {
  /** The main loop's model and effort, as its latest request named them. */
  model?: string
  effort?: string
  /**
   * The engine has no figure from a compaction until the next response: `estimated` marks the stand-in, the
   * compaction's own `tokensAfter` plus the overhead from the context breakdown. The engine's real figure replaces it.
   */
  context?: { pct: number; tokens?: number; window: number; estimated?: boolean }
  fiveHour?: Limit
  weekly?: Limit
  /** US dollars so far, API-price equivalent. */
  cost?: number
  startedAt: number
  now: number
  /** Output tokens per second of the latest main-loop reply. */
  tps?: number
  /** Session totals: input (uncached + cache-written + cache-read), output, and the cache-read part of input. */
  tokensIn: number
  tokensOut: number
  cacheRead: number
  /** A main-loop request has gone out: before it, cost, speed and tokens stay hidden. */
  ran?: boolean
  /**
   * When the request that last wrote or read the main conversation's prompt cache was sent (`$.clock.now()`
   * milliseconds). An entry lives from the start of that request. Absent: nothing cached yet, or the entry was
   * dropped by a /clear, a compaction or a switch of model.
   */
  cacheAt?: number
  /** The model that request named: a cache belongs to one model. */
  cacheModel?: string
  /** The lifetime the person chose in env or settings; absent: the plan decides (an hour on a subscription within its usage, else five minutes). */
  ttlChoice?: '5m' | '1h'
  /** Absent: not a repository, or git has not answered yet. */
  git?: Git
}

declare module 'claude-code' {
  interface PluginState {
    'usage-gauge': {
      gauge: Gauge
    }
  }
}

/** One usage limit window as the session reports it. */
export type Limit = {
  pct: number
  resetsAt?: string
  /** An estimate, drawn with a "~". */
  approx?: boolean
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
}

declare module 'claude-code' {
  interface PluginState {
    'usage-gauge': {
      gauge: Gauge
    }
  }
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, SessionContextBreakdown } from 'claude-code'

import type { Gauge, Limit } from '../types'

// Reads the session's own usage figures, the model each request names and the
// token counts each turn reports. Nothing reaches the model: no tokens.

const gauge = atom({ plugin: 'usage-gauge', key: 'gauge' } as const, {
  startedAt: 0,
  now: 0,
  tokensIn: 0,
  tokensOut: 0,
  cacheRead: 0,
})

const REFRESH_MS = 15_000

/** A bright palette: stages, data colours, chips. */
const C = {
  ok: '#4ade80',
  warn: '#fbbf24',
  bad: '#f87171',
  blue: '#60a5fa',
  violet: '#a78bfa',
  cyan: '#22d3ee',
  model: '#3b5bdb',
}
const EFFORT: Record<string, { bg: string; fg: string }> = {
  low: { bg: '#64748b', fg: '#ffffff' },
  medium: { bg: '#14b8a6', fg: '#04201c' },
  high: { bg: '#f59e0b', fg: '#1c1203' },
  xhigh: { bg: '#ef4444', fg: '#ffffff' },
  max: { bg: '#d946ef', fg: '#ffffff' },
}

const stage = (pct: number) => (pct >= 90 ? C.bad : pct >= 70 ? C.warn : C.ok)

/** Ten cells, each a full 10%: rounded down, so the bar is only full at 100%. */
function cells(pct: number): [number, number] {
  const on = Math.max(0, Math.min(10, Math.floor(pct / 10)))
  return [on, 10 - on]
}

function num(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(n)
}

function duration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function clock12(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  return `${h % 12 === 0 ? 12 : h % 12}${m === 0 ? '' : `:${String(m).padStart(2, '0')}`}${h < 12 ? 'am' : 'pm'}`
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Fri 16 Oct 12pm": the weekly reset, always with its date. */
function dateLabel(iso: string | undefined): string | undefined {
  if (!iso) return undefined
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return undefined
  const d = new Date(at)
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${clock12(d)}`
}
/** "2:40pm" within the day, "Mon 9am" within the week, else "Oct 20". */
function resetLabel(iso: string | undefined, now: number): string | undefined {
  if (!iso) return undefined
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return undefined
  const d = new Date(at)
  const ahead = at - now
  if (ahead < 20 * 3_600_000) return clock12(d)
  if (ahead < 7 * 86_400_000) return `${DAYS[d.getDay()]} ${clock12(d)}`
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`
}

/** "claude-opus-4-1-20250805" → "opus-4-1" for narrow panes. */
function shortModel(m: string): string {
  return m.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

function effortName(e: unknown): string | undefined {
  if (typeof e === 'string') return e
  if (typeof e === 'number') return `${e}`
  return undefined
}

/**
 * What the next response carries besides the conversation: system prompt, tools, memory files, skills. It is the
 * breakdown's used rows other than Messages. Without a Messages row the two cannot be told apart, so there is none.
 */
function overheadOf(b: SessionContextBreakdown | undefined): number | undefined {
  if (!b || !b.categories.some(c => c.name === 'Messages')) return undefined
  const sum = b.categories.reduce((n, c) => (c.kind === 'used' && c.name !== 'Messages' ? n + c.tokens : n), 0)
  return sum > 0 ? sum : undefined
}

/**
 * A compaction leaves the engine with no context figure until the next response. This is the stand-in: the
 * compaction's own count (the summary and the kept messages) plus the overhead, or nothing when either is missing.
 * The count alone read 4.5 times low on 2026-10-13: 28,781 against a real 127,965.
 */
function afterCompaction(tokensAfter: number | undefined, overhead: number | undefined, win: number): Gauge['context'] {
  if (tokensAfter === undefined || tokensAfter <= 0 || overhead === undefined || !(win > 0)) return undefined
  const tokens = tokensAfter + overhead
  return { pct: Math.min(100, Math.round((tokens / win) * 100)), tokens, window: win, estimated: true }
}

/** Reads the session's usage figures into the gauge. */
async function refresh($: EngineInterface): Promise<void> {
  const u = await $.session.usage()
  const t = await $.clock.now()
  const model = await $.session.model().catch(() => undefined)
  // Before the first request names it: the effort the session starts with.
  const startEffort =
    (await $.env.get('CLAUDE_CODE_EFFORT_LEVEL').catch(() => undefined)) ||
    (await $.settings
      .read()
      .then(x => (typeof x.effortLevel === 'string' ? x.effortLevel : undefined))
      .catch(() => undefined))
  const limit = (kind: string): Limit | undefined => {
    const r = u.rateLimits.find(x => x.kind === kind)
    return r ? { pct: r.percentUsed, resetsAt: r.resetsAt } : undefined
  }
  await update($, gauge, g => ({
    ...g,
    startedAt: u.startedAt,
    now: t,
    model: model || g.model,
    effort: g.ran ? g.effort : startEffort || g.effort,
    // No figure from the engine (a fresh session, a /clear, or a compaction before its next response): the old real
    // figure is out of date and goes; a compaction's estimate stays until the real one arrives.
    context:
      u.context.percent !== undefined
        ? { pct: u.context.percent, tokens: u.context.tokens, window: u.context.window }
        : g.context?.estimated
          ? g.context
          : undefined,
    fiveHour: limit('five_hour') ?? g.fiveHour,
    weekly: limit('seven_day') ?? g.weekly,
    cost: u.cost?.usd ?? g.cost,
  }))
}

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
function addUsage(g: Gauge, u: Usage): Gauge {
  return {
    ...g,
    tokensIn: g.tokensIn + u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens,
    tokensOut: g.tokensOut + u.output_tokens,
    cacheRead: g.cacheRead + u.cache_read_input_tokens,
  }
}

type Kit = { Box: (p: any) => RenderElement; Text: (p: any) => RenderElement }

function meter(ui: Kit, key: string, label: string, l: Limit | undefined, reset: string | undefined): RenderElement {
  const { Text } = ui
  if (!l) {
    return (
      <Text key={key}>
        <Text dimColor>{`${label} `}</Text>
        <Text dimColor>{'▱▱▱▱▱▱▱▱▱▱ –'}</Text>
      </Text>
    )
  }
  const [on, off] = cells(l.pct)
  const color = stage(l.pct)
  return (
    <Text key={key}>
      <Text dimColor>{`${label} `}</Text>
      <Text color={color}>{'▰'.repeat(on)}</Text>
      <Text dimColor>{'▱'.repeat(off)}</Text>
      <Text bold color={color}>{` ${l.approx ? '~' : ''}${Math.round(l.pct)}%`}</Text>
      {reset && <Text dimColor>{` ↻ ${reset}`}</Text>}
    </Text>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await refresh($).catch(() => undefined)
    $.clock.every(REFRESH_MS, () => {
      void refresh($).catch(() => undefined)
    })
    return next(e)
  })

  // The main loop's model and effort, and how fast its reply came out.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      // A subagent's request: its tokens are the session's too.
      const r = yield* next(e)
      try {
        const u = r?.usage
        if (u) void update($, gauge, g => addUsage(g, u)).catch(() => undefined)
      } catch {
        // no usage on this step
      }
      return r
    }
    try {
      const model = e.model
      const effort = effortName(e.effort)
      void update($, gauge, g => (g.ran && g.model === model && g.effort === effort ? g : { ...g, model, effort: effort ?? g.effort, ran: true })).catch(() => undefined)
    } catch {
      // never in the way of the request
    }
    const stream = next(e)
    let first: number | undefined
    let piece = await stream.next()
    while (!piece.done) {
      if (first === undefined) first = await $.clock.now().catch(() => undefined)
      yield piece.value
      piece = await stream.next()
    }
    const result = piece.value
    try {
      const u = result?.usage
      if (u) void update($, gauge, g => addUsage(g, u)).catch(() => undefined)
      const out = result?.usage?.output_tokens
      const end = await $.clock.now()
      if (first !== undefined && out && out >= 20 && end - first > 300) {
        const tps = Math.round(out / ((end - first) / 1000))
        void update($, gauge, g => ({ ...g, tps })).catch(() => undefined)
      }
    } catch {
      // a step with no usage: keep the last speed
    }
    return result
  })

  // A compaction that stands: until the next response the engine has no context figure, so draw the compaction's own
  // count plus the overhead (with a "~"), or a dash when either is missing. A skip, a precompute and a subagent's own
  // compaction change nothing.
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined || e.trigger === 'precompute' || r.skip !== undefined) return r
    let context: Gauge['context']
    try {
      // 'summary' is a local estimate; 'full' would send one token-count request per tool and memory file.
      const u = await $.session.usage({ breakdown: 'summary' })
      context = afterCompaction(r.tokensAfter, overheadOf(u.context.breakdown), u.context.window)
    } catch {
      context = undefined
    }
    await update($, gauge, g => ({ ...g, context })).catch(() => undefined)
    return r
  }).catch(($, e, next) => next(e))

  // A turn ended: cost, context and limits have moved.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) await refresh($).catch(() => undefined)
    return r
  }).catch(($, e, next) => next(e))

  // Two rows under the prompt, in place of the hint line, which stays beneath them.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const ui = { Box, Text }
    const g: Gauge = await read($, gauge)
    const cols = (e.props as { bodyColumns?: number }).bodyColumns ?? 120
    const isNarrow = cols < 90
    const t = g.now || g.startedAt
    const chip = g.model && (
      <Text key="ug-chip">
        <Text bold color="#ffffff" backgroundColor={C.model}>{` ${isNarrow ? shortModel(g.model) : g.model} `}</Text>
        {g.effort && (
          <Text bold color={EFFORT[g.effort]?.fg ?? '#ffffff'} backgroundColor={EFFORT[g.effort]?.bg ?? '#64748b'}>
            {` ${g.effort} `}
          </Text>
        )}
      </Text>
    )
    const gap = (k: string) => <Text key={k}>{'   '}</Text>
    const row1 = (
      <Box key="ug-row1" flexWrap="wrap">
        {chip}
        {chip && gap('ug-g1')}
        {g.startedAt > 0 && (
          <Text key="ug-time">
            <Text dimColor>⏱ </Text>
            <Text>{duration(t - g.startedAt)}</Text>
          </Text>
        )}
        {g.ran && g.cost !== undefined && gap('ug-g2')}
        {g.ran && g.cost !== undefined && <Text key="ug-cost" bold color={C.ok}>{`$${g.cost.toFixed(2)}`}</Text>}
        {g.ran && gap('ug-g3')}
        {!g.ran ? null : g.tps !== undefined ? (
          <Text key="ug-tps" color={C.cyan}>{`⚡ ${g.tps} t/s`}</Text>
        ) : (
          <Text key="ug-tps" dimColor>⚡ – t/s</Text>
        )}
        {g.ran && !isNarrow && gap('ug-g4')}
        {g.ran && !isNarrow && (
          <Text key="ug-tokens">
            <Text dimColor>in </Text>
            {g.tokensIn > 0 ? <Text color={C.blue}>{num(g.tokensIn)}</Text> : <Text dimColor>–</Text>}
            <Text dimColor>  out </Text>
            {g.tokensIn > 0 ? <Text color={C.violet}>{num(g.tokensOut)}</Text> : <Text dimColor>–</Text>}
          </Text>
        )}
      </Box>
    )
    const ctx: Limit | undefined = g.context ? { pct: g.context.pct, approx: g.context.estimated } : undefined
    const row2 = (
      <Box key="ug-row2" flexWrap="wrap">
        {meter(ui, 'ug-ctx', isNarrow ? 'ctx' : 'context', ctx, undefined)}
        <Text>{isNarrow ? '  ' : '     '}</Text>
        {meter(ui, 'ug-5h', isNarrow ? '5h' : '5 hour', g.fiveHour, resetLabel(g.fiveHour?.resetsAt, t))}
        <Text>{isNarrow ? '  ' : '     '}</Text>
        {meter(ui, 'ug-wk', isNarrow ? 'wk' : 'weekly', g.weekly, isNarrow ? undefined : dateLabel(g.weekly?.resetsAt))}
      </Box>
    )
    const beneath = await next(e)
    const isEmpty = (n: unknown): boolean => {
      if (n === null || n === undefined || n === false || n === true) return true
      if (typeof n === 'string') return n.trim() === ''
      if (Array.isArray(n)) return n.every(isEmpty)
      const el = n as { type?: unknown; children?: unknown[] }
      if (el.type === 'Box' || el.type === 'Text') return (el.children ?? []).every(isEmpty)
      return false
    }
    return (
      <Box flexDirection="column">
        {row1}
        {row2}
        {!isEmpty(beneath) && beneath}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}

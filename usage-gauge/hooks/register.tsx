import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, SessionContextBreakdown } from 'claude-code'

import type { Gauge, Git, Limit } from '../types'
import { clip, layoutOf, parseStatus, showOf, slotsOf } from './git'
import type { Show } from './git'

// Reads the session's own usage figures, the model each request names and the
// token counts each turn reports, and (read-only) the state of the git repository the session sits in. Nothing reaches
// the model: no tokens.

const gauge = atom({ plugin: 'usage-gauge', key: 'gauge' } as const, {
  startedAt: 0,
  now: 0,
  tokensIn: 0,
  tokensOut: 0,
  cacheRead: 0,
})

const REFRESH_MS = 15_000

/** What the person chose to show (the manifest's userConfig); `register` sets it from its options. */
let show: Show = showOf({})

/**
 * The model and effort chips use Anthropic's brand accents (blue and orange) with the brand dark for the text. White
 * text on the orange is 3.1:1, below the 4.5:1 small text needs; the dark is 5.9:1 on it and 6.3:1 on the blue.
 */
const CHIP = {
  model: { bg: '#6a9bcc', fg: '#141413' },
  effort: { bg: '#d97757', fg: '#141413' },
}
/** Claude Code's own symbols for the effort levels, so the level reads here as it does there. One colour; the shape is the level. */
const GLYPH: Record<string, string> = { low: '○', medium: '◐', high: '●', xhigh: '◉', max: '◈' }

/**
 * A meter is drawn in Claude Code's own colours, by theme key, so it follows the person's theme: the fill its own usage
 * bars use, then the theme's warning from 70% and its error from 90%. The cost, speed and token numbers are plain text.
 */
const stage = (pct: number) => (pct >= 90 ? 'error' : pct >= 70 ? 'warning' : 'rate_limit_fill')

const MIN_MS = 60_000
/** The two lifetimes the API offers for a prompt cache entry. */
const TTL_MS = { '5m': 5 * MIN_MS, '1h': 60 * MIN_MS } as const
type Ttl = keyof typeof TTL_MS

const isTtl = (v: unknown): v is Ttl => v === '5m' || v === '1h'
const isOn = (v: string | undefined): boolean => v === '1' || v === 'true'

/**
 * The lifetime the person chose for the main conversation's cache, in Claude Code's own order of precedence:
 * FORCE_PROMPT_CACHING_5M, CLAUDE_CODE_PROMPT_CACHE_TTL, the promptCacheTtl setting, ENABLE_PROMPT_CACHING_1H. Anything
 * but "5m" or "1h" is ignored there, so it is here. Undefined: none chosen, and the plan decides (cacheTtl).
 */
async function chosenTtl($: EngineInterface, settings: Record<string, unknown> | undefined): Promise<Ttl | undefined> {
  if (isOn(await $.env.get('FORCE_PROMPT_CACHING_5M').catch(() => undefined))) return '5m'
  const env = await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL').catch(() => undefined)
  if (isTtl(env)) return env
  if (isTtl(settings?.promptCacheTtl)) return settings.promptCacheTtl
  if (isOn(await $.env.get('ENABLE_PROMPT_CACHING_1H').catch(() => undefined))) return '1h'
  return undefined
}

/**
 * The lifetime to count down from. Claude Code asks for an hour for the main conversation only on a subscription within
 * its plan's usage (the plan's 5-hour and weekly windows are reported, and neither is at 100%); an API key, a cloud
 * provider and usage credits get five minutes. A choice of the person's beats that.
 */
function cacheTtl(g: Gauge): Ttl {
  if (g.ttlChoice) return g.ttlChoice
  const onPlan = g.fiveHour !== undefined || g.weekly !== undefined
  const over = (g.fiveHour?.pct ?? 0) >= 100 || (g.weekly?.pct ?? 0) >= 100
  return onPlan && !over ? '1h' : '5m'
}

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

/** One spelling for a model however it is named: "claude-opus-5-5-20261001[1m]", "Opus 5.5" and "opus-5-5" are all "opus-5-5". */
function baseModel(m: string): string {
  return m
    .toLowerCase()
    .trim()
    .replace(/\[[^\]]*\]$/, '')
    .replace(/^.*?claude-/, '')
    .replace(/-\d{8}$/, '')
    .replace(/[\s.]+/g, '-')
}

/** The aliases /model takes, and the families each may run on (opusplan plans on Opus and works on Sonnet). */
const ALIAS: Record<string, string[]> = { opus: ['opus'], sonnet: ['sonnet'], haiku: ['haiku'], fable: ['fable'], opusplan: ['opus', 'sonnet'] }

/** Whether a request on `sent` runs the model the person selected. "default" or an empty selection says nothing, so it matches. */
function sameModel(selected: string, sent: string | undefined): boolean {
  if (sent === undefined) return true
  const a = baseModel(selected)
  const b = baseModel(sent)
  if (a === b || a === '' || a === 'default') return true
  const families = ALIAS[a]
  return families !== undefined && families.some(f => b === f || b.startsWith(`${f}-`))
}

/**
 * The effort the person selected, in Claude Code's order: CLAUDE_CODE_EFFORT_LEVEL, then the selected model's own entry
 * under modelSettings (what /effort sets for one model), then the top-level effortLevel. Undefined: none set, and the
 * model's default applies, which this mod cannot know.
 */
async function chosenEffort($: EngineInterface, settings: Record<string, unknown> | undefined, model: string | undefined): Promise<string | undefined> {
  const env = await $.env.get('CLAUDE_CODE_EFFORT_LEVEL').catch(() => undefined)
  if (env) return env
  const per = settings?.modelSettings
  if (model && per && typeof per === 'object') {
    const exact = Object.keys(per).filter(k => baseModel(k) === baseModel(model))
    // An alias names one model only when exactly one entry is of its family.
    const hits = exact.length > 0 ? exact : Object.keys(per).filter(k => sameModel(model, k))
    const [only] = hits
    const level = hits.length === 1 && only !== undefined ? (per as Record<string, { effortLevel?: unknown }>)[only]?.effortLevel : undefined
    if (typeof level === 'string') return level
  }
  return typeof settings?.effortLevel === 'string' ? settings.effortLevel : undefined
}

function effortName(e: unknown): string | undefined {
  if (typeof e === 'string') return e
  if (typeof e === 'number') return `${e}`
  return undefined
}

/** "● high". A level with no symbol (a token budget, a name this build does not know) is its name alone, never a wrong shape. */
function effortLabel(effort: string): string {
  const glyph = GLYPH[effort]
  return glyph ? `${glyph} ${effort}` : effort
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
  const settings = await $.settings.read().catch(() => undefined)
  // Before the first request names them: the model and effort the session starts with.
  const startEffort = await chosenEffort($, settings, model)
  const ttlChoice = await chosenTtl($, settings)
  const limit = (kind: string): Limit | undefined => {
    const r = u.rateLimits.find(x => x.kind === kind)
    return r ? { pct: r.percentUsed, resetsAt: r.resetsAt } : undefined
  }
  await update($, gauge, g => ({
    ...g,
    // A /clear starts the session's figures over: what was cached belongs to the conversation that is gone.
    ...(g.startedAt > 0 && u.startedAt > 0 && u.startedAt !== g.startedAt ? { cacheAt: undefined, cacheModel: undefined } : {}),
    ttlChoice,
    startedAt: u.startedAt,
    now: t,
    // After it, the chips are what was sent: the selection is compared with them at each request, never drawn over them.
    model: g.ran ? g.model : model || g.model,
    effort: g.ran ? g.effort : startEffort || g.effort,
    // The pick as it stands, for the chips to show between requests.
    pick: { model: model || undefined, effort: startEffort },
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

/**
 * The git slots read the repository the session sits in, and only read it. `$.process.run` runs git with the repository's
 * hooks off, so a plugin must never commit or push: status and fetch are all this file runs, and tests/git.test.tsx holds
 * every argv to that. `--no-optional-locks` keeps status from taking the index lock, so it never makes the person's own
 * git command wait. The v2 porcelain format gives the branch, ahead and behind, and one line per file in a single call.
 */
const GIT_STATUS = ['git', '--no-optional-locks', '-c', 'core.quotepath=off', 'status', '--porcelain=v2', '--branch', '--untracked-files=normal']
/** A fetch writes git's remote-tracking refs and nothing in the working tree. It must never stop to ask for a password. */
const GIT_FETCH = ['git', 'fetch', '--quiet', '--no-recurse-submodules']
const GIT_FETCH_ENV = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }
/** How often the remote is asked for news, so that ↓ is current. */
const FETCH_MS = 5 * MIN_MS

let gitBusy = false
let fetching = false
let fetchedAt = 0
let fetchFailed = false
let upstream = false

/** Runs `git status` and keeps the counts. A git that did not answer (it timed out) leaves the last counts; one that failed (not a repository) clears them. */
async function readGit($: EngineInterface): Promise<void> {
  const r = await $.process.run(GIT_STATUS, { timeoutMs: 15_000 }).catch(() => undefined)
  if (!r) return
  const parsed = r.exitCode === 0 ? parseStatus(r.stdout) : undefined
  upstream = parsed?.upstream === true
  const git: Git | undefined = parsed && (fetchFailed && parsed.upstream ? { ...parsed, stale: true } : parsed)
  await update($, gauge, g => ({ ...g, git })).catch(() => undefined)
}

/** Asks the remote for news, then reads the counts again. A failed fetch (offline, no credentials) makes ↓ a question mark. */
async function fetchGit($: EngineInterface): Promise<void> {
  try {
    const r = await $.process.run(GIT_FETCH, { env: GIT_FETCH_ENV, timeoutMs: 20_000 }).catch(() => undefined)
    fetchFailed = !r || r.exitCode !== 0
    await readGit($)
  } finally {
    fetching = false
  }
}

/** The status now, and a fetch when one is due. Never awaited by a turn: the fetch can take as long as the network does. */
async function refreshGit($: EngineInterface): Promise<void> {
  if (!show.git || gitBusy) return
  gitBusy = true
  try {
    await readGit($)
    const t = await $.clock.now()
    if (show.fetch && upstream && !fetching && t - fetchedAt >= FETCH_MS) {
      fetching = true
      fetchedAt = t
      void fetchGit($).catch(() => undefined)
    }
  } catch {
    // never in the way of the gauge
  } finally {
    gitBusy = false
  }
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

/**
 * The main conversation's cache after a response. An entry lives from the START of the request that wrote or read it
 * (not from the end of the reply), and each request that reports cache tokens, a hit or a write, restarts that clock. A
 * response with none means nothing was cached (a prompt under the model's minimum, or caching off).
 */
function withCache(g: Gauge, u: Usage, sentAt: number | undefined, model: string): Gauge {
  if ((u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) <= 0) return { ...g, cacheAt: undefined, cacheModel: undefined }
  if (sentAt === undefined) return g
  return { ...g, cacheAt: sentAt, cacheModel: model, now: Math.max(g.now, sentAt) }
}

type Kit = { Box: (p: any) => RenderElement; Text: (p: any) => RenderElement }

/**
 * "⏳ 52m": how long the main conversation's prompt cache stays warm, counted from the request that last wrote or read
 * it. The minutes are rounded up, so "1m" lasts to the last second. The value is plain text while there is time, then
 * drawn in the same theme keys as a meter that fills: warning once 70% of the lifetime is spent, error from 90%, so the
 * colour is relative to the lifetime (an hour on a plan, five minutes otherwise) and the number carries no note of it.
 * "cold" in error once it has run out; a dash when nothing is cached (before the first response, after a /clear, a
 * compaction or a model switch).
 */
function cacheChip(ui: Kit, g: Gauge, now: number): RenderElement {
  const { Text } = ui
  const glyph = <Text dimColor>{'⏳ '}</Text>
  if (g.cacheAt === undefined) {
    return (
      <Text key="ug-cache">
        {glyph}
        <Text dimColor>–</Text>
      </Text>
    )
  }
  const ttl = cacheTtl(g)
  const total = TTL_MS[ttl]
  const left = g.cacheAt + total - Math.max(now, g.cacheAt)
  if (left <= 0) {
    return (
      <Text key="ug-cache">
        {glyph}
        <Text color={stage(100)}>cold</Text>
      </Text>
    )
  }
  const color = stage(((total - left) / total) * 100)
  const mins = Math.ceil(left / MIN_MS)
  return (
    <Text key="ug-cache">
      {glyph}
      <Text {...(color === 'rate_limit_fill' ? {} : { color })}>{`${mins}m`}</Text>
    </Text>
  )
}

/**
 * "⏱ 1h 12m ⏳ 52m": the session's clock and the cache's, one chip, one space between. Either part can be turned off in
 * /config and the other stands alone. Nothing at all when both are off, or when only the time is on and the session has
 * not started.
 */
function clockChip(ui: Kit, g: Gauge, now: number, withTime: boolean, withCache: boolean): RenderElement | undefined {
  const { Text } = ui
  const parts: RenderElement[] = []
  if (withTime && g.startedAt > 0) {
    parts.push(
      <Text key="ug-time">
        <Text dimColor>⏱ </Text>
        <Text>{duration(now - g.startedAt)}</Text>
      </Text>,
    )
  }
  if (withCache) parts.push(cacheChip(ui, g, now))
  if (parts.length === 0) return undefined
  return <Text key="ug-clock">{parts.flatMap((p, i) => (i === 0 ? [p] : [<Text key="ug-clock-s">{' '}</Text>, p]))}</Text>
}

/**
 * "main ↓2 ±4 ↑1": the branch, then the repository's three questions in three fixed places, so the eye learns where to look. ↓ is what the
 * remote has that this branch lacks (pull), ± is what waits to be committed, ↑ is what waits to be pushed (a dim ?n
 * between them counts files git does not track yet, where the pane has room). A zero is dim and a count is lit, so a
 * clean repository is three dim zeros, never a missing chip. The colours are the theme's: warning for news on the
 * remote, error for a branch that has diverged or a file in conflict (slotsOf has the rules).
 */
function gitChip(ui: Kit, git: Git, withUntracked: boolean, branchRoom: number): RenderElement {
  const { Text } = ui
  const parts: RenderElement[] = []
  // The branch is the one piece of the chip that gives: cut short with … to the room the pane leaves, or left out.
  const branch = branchRoom > 0 ? clip(git.branch, branchRoom) : ''
  if (branch !== '') {
    parts.push(<Text key="ug-git-branch">{branch}</Text>)
    parts.push(<Text key="ug-git-b">{' '}</Text>)
  }
  slotsOf(git, withUntracked).forEach((s, i) => {
    if (i > 0) parts.push(<Text key={`ug-git-s${i}`}>{' '}</Text>)
    parts.push(
      <Text key={`ug-git-${s.key}`} {...(s.color ? { color: s.color } : {})} {...(s.dim ? { dimColor: true } : {})}>
        {s.text}
      </Text>,
    )
  })
  return <Text key="ug-git">{parts}</Text>
}

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
      {l.tokens !== undefined && <Text>{` ${l.approx ? '~' : ''}${num(l.tokens)}`}</Text>}
      {reset && <Text dimColor>{` ↻ ${reset}`}</Text>}
    </Text>
  )
}

export const register: Register = (on, options) => {
  show = showOf(options)

  on('session.start', async ($, e, next) => {
    await refresh($).catch(() => undefined)
    void refreshGit($)
    $.clock.every(REFRESH_MS, () => {
      void refresh($).catch(() => undefined)
      void refreshGit($)
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
    // What the person had selected as this request went out, to hold the request to.
    let selected: Gauge['selected']
    try {
      const [sel, settings] = await Promise.all([$.session.model().catch(() => undefined), $.settings.read().catch(() => undefined)])
      // A request with no effort is on a model that takes none, and a token budget is no level: nothing to hold it to.
      const effort = typeof e.effort !== 'string' ? undefined : await chosenEffort($, settings, sel || e.model)
      selected = { model: sel || undefined, effort }
    } catch {
      selected = undefined
    }
    try {
      const model = e.model
      const effort = effortName(e.effort)
      const same = (x: Gauge['selected']) => x?.model === selected?.model && x?.effort === selected?.effort
      void update($, gauge, g =>
        g.ran && g.model === model && g.effort === effort && same(g.selected) && (!selected || same(g.pick))
          ? g
          : { ...g, model, effort: effort ?? g.effort, ran: true, selected, ...(selected ? { pick: selected } : {}) },
      ).catch(() => undefined)
      // A cache belongs to the model that wrote it: a request on another model has none to read, so the clock goes.
      void update($, gauge, g => (g.cacheModel !== undefined && g.cacheModel !== model ? { ...g, cacheAt: undefined, cacheModel: undefined } : g)).catch(() => undefined)
    } catch {
      // never in the way of the request
    }
    const sentAt = await $.clock.now().catch(() => undefined)
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
      if (u) void update($, gauge, g => withCache(addUsage(g, u), u, sentAt, e.model)).catch(() => undefined)
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
    // The conversation is rewritten, so the cache of the old one is no use: a dash until the next response caches the new.
    await update($, gauge, g => ({ ...g, context, cacheAt: undefined, cacheModel: undefined })).catch(() => undefined)
    return r
  }).catch(($, e, next) => next(e))

  // A turn ended: cost, context and limits have moved.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) {
      await refresh($).catch(() => undefined)
      // The turn may have written files or committed: look again, without making the turn wait for git.
      void refreshGit($)
    }
    return r
  }).catch(($, e, next) => next(e))

  // Two rows under the prompt, in place of the hint line, which stays beneath them.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const ui = { Box, Text }
    const g: Gauge = await read($, gauge)
    // The surface's own measure. PromptHint's props carry no width (that is the AbovePrompt band's `bodyColumns`), so
    // reading one here always fell back to wide. A surface that has not measured (no width, or 0) is drawn wide, whatever
    // the threshold.
    // With the git slots on the row, the token counts give way to them in a pane too narrow for both (see layoutOf).
    // `show.git` is checked here as well as in refreshGit: the gauge's state outlives the reload that a change in /config
    // causes, so a repository read by the module before it can still be in it.
    const slots = show.git && g.git !== undefined
    const { narrow: isNarrow, tokens: withTokens, untracked: withUntracked, branch: branchRoom } = layoutOf(e.viewport?.columns, slots, show.tokens)
    const t = g.now || g.startedAt
    // The person picked again since the last request (/model, /effort): the new pick, in the plain colours, until a
    // request is held to it.
    const pick = g.ran ? g.pick : undefined
    const newModel = pick?.model !== undefined && g.selected !== undefined && pick.model !== g.selected.model ? pick.model : undefined
    const newEffort = pick?.effort !== undefined && g.selected?.effort !== undefined && pick.effort !== g.selected.effort ? pick.effort : undefined
    const model = newModel ?? g.model
    const effort = newEffort ?? g.effort
    // A request that did not send what the person selected: that chip in the theme's warning colour, "selected → sent".
    const selModel = !newModel && g.ran && g.selected?.model !== undefined && !sameModel(g.selected.model, g.model) ? g.selected.model : undefined
    const selEffort = !newEffort && g.ran && g.selected?.effort !== undefined && g.effort !== undefined && g.selected.effort !== g.effort ? g.selected.effort : undefined
    const chip = model && (
      <Text key="ug-chip">
        {selModel ? (
          <Text bold color={CHIP.model.fg} backgroundColor="warning">{` ${shortModel(selModel)} → ${shortModel(model)} `}</Text>
        ) : (
          <Text bold color={CHIP.model.fg} backgroundColor={CHIP.model.bg}>{` ${isNarrow ? shortModel(model) : model} `}</Text>
        )}
        {effort && (
          <Text bold color={CHIP.effort.fg} backgroundColor={selEffort ? 'warning' : CHIP.effort.bg}>
            {selEffort ? ` ${effortLabel(selEffort)} → ${effortLabel(effort)} ` : ` ${effortLabel(effort)} `}
          </Text>
        )}
      </Text>
    )
    const gap = (k: string) => <Text key={k}>{'   '}</Text>
    // Row 1 is the items the person chose and the pane has room for, three spaces apart: a missing one leaves no hole.
    const items: RenderElement[] = []
    if (chip) items.push(chip)
    const clock = clockChip(ui, g, t, show.time, show.cache)
    if (clock) items.push(clock)
    if (show.cost && g.ran && g.cost !== undefined) items.push(<Text key="ug-cost" bold>{`$${g.cost.toFixed(2)}`}</Text>)
    if (show.speed && g.ran) {
      items.push(g.tps !== undefined ? <Text key="ug-tps">{`⚡ ${g.tps} t/s`}</Text> : <Text key="ug-tps" dimColor>⚡ – t/s</Text>)
    }
    if (withTokens && g.ran) {
      items.push(
        <Text key="ug-tokens">
          <Text dimColor>in </Text>
          {g.tokensIn > 0 ? <Text>{num(g.tokensIn)}</Text> : <Text dimColor>–</Text>}
          <Text dimColor>  out </Text>
          {g.tokensIn > 0 ? <Text>{num(g.tokensOut)}</Text> : <Text dimColor>–</Text>}
        </Text>,
      )
    }
    if (slots && g.git) items.push(gitChip(ui, g.git, withUntracked, branchRoom))
    const row1 = (
      <Box key="ug-row1" flexWrap="wrap">
        {items.flatMap((item, i) => (i === 0 ? [item] : [gap(`ug-g${i}`), item]))}
      </Box>
    )
    // The context meter also shows how many tokens the context holds (it was the session board's "ctx 305K" chip).
    const ctx: Limit | undefined = g.context ? { pct: g.context.pct, approx: g.context.estimated, tokens: g.context.tokens } : undefined
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

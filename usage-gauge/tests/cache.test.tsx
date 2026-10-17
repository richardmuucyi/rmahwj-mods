import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// The ⏳ part of the clock chip, right after the session time on row 1 ("⏱ 1h 12m ⏳ 52m"): how long the main conversation's prompt cache stays warm. The cache lives from the
// START of the request that wrote or read it (not from the end of the reply), every request that reports cache tokens
// restarts the clock, and a lifetime of 1 hour (a subscription within its plan) or 5 minutes (anything else, or a
// choice in the person's env or settings) runs out in silence. The chip is a dash until a response has cached
// something, counts the minutes left, turns to the theme's warning at 30% left and its error at 10% left, and says
// "cold" once the lifetime has passed.

const HINT = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
const START = Date.parse('2026-10-15T10:00:00')
const SEC = 1_000
const MIN = 60_000
const MODEL = 'claude-opus-5-5'
const OTHER = 'claude-sonnet-5-5'
const MSGS = [{ role: 'user' as const, text: 'summary', toolUses: [] }]

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
/** A hit: most of the prompt read from the cache. */
const READ: Usage = { input_tokens: 1_000, output_tokens: 100, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 2_000 }
/** A miss: the whole prompt written. It starts the clock too. */
const WRITE: Usage = { input_tokens: 0, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 92_000 }
/** Nothing cached: a prompt under the model's minimum, or caching off. */
const NONE: Usage = { input_tokens: 92_000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

type Limit = { kind: string; percentUsed: number; resetsAt: string }
const limits = (fiveHour = 20, weekly = 10): Limit[] => [
  { kind: 'five_hour', percentUsed: fiveHour, resetsAt: '2026-10-15T14:40:00' },
  { kind: 'seven_day', percentUsed: weekly, resetsAt: '2026-10-19T09:00:00' },
]
/** A subscription with room left: the plan's own 5-hour and weekly windows are reported. */
const SUB = limits()

type Rig = {
  startedAt: number
  rateLimits: Limit[]
  env: Record<string, string>
  settings: Record<string, unknown>
  /** What the next response reports; null: none came back (an interrupted or failed request). */
  usage: Usage | null
  /** How long the reply streams, on the mock clock. */
  streamMs: number
  /** Reading the person's env and settings fails. */
  unreadable: boolean
  skipCompact: boolean
}
const rig = (over: Partial<Rig> = {}): Rig => ({ startedAt: START, rateLimits: SUB, env: {}, settings: {}, usage: READ, streamMs: 0, unreadable: false, skipCompact: false, ...over })

function bottom(on: On, clock: ReturnType<typeof mock.clock>, r: Rig) {
  on('session.usage', () => ({
    value: { startedAt: r.startedAt, context: { tokens: 90_000, window: 200_000, percent: 45 }, rateLimits: r.rateLimits } as never,
  }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: MODEL }))
  on('env.get', (_$, e) => {
    if (r.unreadable) throw new Error('env is not readable')
    return { value: r.env[e.name] }
  })
  on('settings.read', () => {
    if (r.unreadable) throw new Error('settings are not readable')
    return { value: r.settings }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.compact', () => (r.skipCompact ? ({ skip: 'off' } as never) : ({ messages: MSGS, tokensBefore: 190_000, tokensAfter: 46_000 } as never)))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine-own" />
  })
  on('turn.step', async function* (_$, e) {
    yield { kind: 'text', index: 0, text: 'ok' } as never
    if (r.streamMs > 0) await clock.advance(r.streamMs)
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: r.usage } as never
  })
}

type Surface = 'terminal' | 'desktop'
const start = ($: Engine, surface: Surface = 'terminal') => $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })

/** One request of the main loop (or a subagent's) and the end of its turn, which refreshes the gauge. */
async function ask($: Engine, o: { model?: string; agentId?: string } = {}) {
  const s = $.turn.step({ turnId: 't1', index: 0, model: o.model ?? MODEL, effort: 'high', messageCount: 1, ...(o.agentId ? { agentId: o.agentId } : {}) })
  for await (const _ of s) {
    // drain
  }
  await $.turn.complete({
    answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer',
    usage: { model: o.model ?? MODEL, ...READ },
  } as never)
}

async function row1($: Engine, surface: Surface = 'terminal', columns?: number): Promise<string> {
  const band = await $.ui.mount({
    plugin: 'usage-gauge', surface, component: 'PromptHint', props: HINT,
    ...(columns === undefined ? {} : { viewport: { columns, rows: 30 } }),
  })
  const text = (await band.find({ key: 'ug-row1' }))?.text.replace(/\s+/g, ' ').trim() ?? ''
  await band.unmount()
  return text
}

/** The cache part of the clock chip as drawn: the hourglass and what follows it ("⏳ 52m", "⏳ cold" or "⏳ –"). */
async function chip($: Engine, surface: Surface = 'terminal', columns?: number): Promise<string> {
  const text = await row1($, surface, columns)
  return /⏳ (?:–|cold|\d+m)/.exec(text)?.[0] ?? ''
}

/** Text drawn in a colour of its own, left to right: [text, colour, bold]. The model and effort chips (a background) are not in it. */
function colouredOf(node: unknown, out: [string, string, boolean][] = []): [string, string, boolean][] {
  const n = node as { props?: { color?: string; backgroundColor?: string; bold?: boolean }; children?: unknown[] } | string | undefined
  if (n === undefined || typeof n === 'string') return out
  const text = (n.children ?? []).filter(c => typeof c === 'string').join('')
  if (n.props?.color && !n.props.backgroundColor) {
    if (text) out.push([text, n.props.color, n.props.bold === true])
  } else for (const c of n.children ?? []) colouredOf(c, out)
  return out
}
async function colour($: Engine, surface: Surface = 'terminal'): Promise<[string, string, boolean][]> {
  const band = await $.ui.mount({ plugin: 'usage-gauge', surface, component: 'PromptHint', props: HINT })
  const out = colouredOf(await band.find({ key: 'ug-row1' }))
  await band.unmount()
  return out
}

/** A session on a subscription, started, with nothing asked yet. */
async function session($: Engine, on: On, over: Partial<Rig> = {}, surface: Surface = 'terminal') {
  const clock = mock.clock(on, { now: START })
  const r = rig(over)
  bottom(on, clock, r)
  await start($, surface)
  return { clock, r }
}

// ── the dash, the count and the position ─────────────────────────────────────

for (const surface of ['terminal', 'desktop'] as const) {
  test(`before the first response: a dash after the time, in no colour (${surface})`, async ($, on) => {
    await session($, on, {}, surface)
    expect(await row1($, surface)).toBe('claude-opus-5-5 ⏱ 0m ⏳ –')
    expect(await colour($, surface)).toEqual([])
  })

  test(`after a response that cached: the chip is part of the clock chip, right after the session time (${surface})`, async ($, on) => {
    await session($, on, {}, surface)
    await ask($)
    expect(await row1($, surface)).toBe('claude-opus-5-5 ● high ⏱ 0m ⏳ 60m ⚡ – t/s in 93k out 100')
    // Plain text while there is time: no colour of its own.
    expect(await colour($, surface)).toEqual([])
  })
}

test('the minutes left count down with the idle time, and the colour follows stage(): plain, warning from 30% left, error from 10%', async ($, on) => {
  const { clock } = await session($, on)
  await ask($)
  let at = 0
  // [minutes idle, the chip, its colour]
  for (const [idle, text, key] of [
    [0, '⏳ 60m', undefined],
    [30, '⏳ 30m', undefined],
    [41, '⏳ 19m', undefined], // 68% of the hour spent
    [42, '⏳ 18m', 'warning'], // 70%
    [53, '⏳ 7m', 'warning'], // 88%
    [54, '⏳ 6m', 'error'], // 90%
    [59, '⏳ 1m', 'error'],
  ] as const) {
    await clock.advance((idle - at) * MIN)
    at = idle
    expect(await chip($)).toBe(text)
    expect(await colour($)).toEqual(key === undefined ? [] : [[text.slice(2), key, false]])
  }
})

test('the lifetime has passed: "cold" in the error colour, and it stays cold', async ($, on) => {
  const { clock } = await session($, on)
  await ask($)
  await clock.advance(60 * MIN)
  expect(await chip($)).toBe('⏳ cold')
  expect(await colour($)).toEqual([['cold', 'error', false]])
  await clock.advance(30 * MIN)
  expect(await chip($)).toBe('⏳ cold')
})

test('a new request restarts the clock, also from cold', async ($, on) => {
  const { clock } = await session($, on)
  await ask($)
  await clock.advance(50 * MIN)
  expect(await chip($)).toBe('⏳ 10m')
  await ask($)
  expect(await chip($)).toBe('⏳ 60m')
  await clock.advance(70 * MIN)
  expect(await chip($)).toBe('⏳ cold')
  await ask($)
  expect(await chip($)).toBe('⏳ 60m')
})

// ── what starts, keeps and drops the clock ───────────────────────────────────

test('the clock runs from the start of the request, not from the end of the reply', async ($, on) => {
  await session($, on, { streamMs: 4 * MIN })
  await ask($)
  // the reply took 4 minutes of the hour
  expect(await chip($)).toBe('⏳ 56m')
})

test('a response that only wrote the cache (a miss) starts the clock too', async ($, on) => {
  await session($, on, { usage: WRITE })
  await ask($)
  expect(await chip($)).toBe('⏳ 60m')
})

test('a response that reports no cache tokens means nothing is cached: a dash, also over a running clock', async ($, on) => {
  const { clock, r } = await session($, on)
  r.usage = NONE
  await ask($)
  expect(await chip($)).toBe('⏳ –')
  r.usage = READ
  await ask($)
  await clock.advance(10 * MIN)
  expect(await chip($)).toBe('⏳ 50m')
  r.usage = NONE
  await ask($)
  expect(await chip($)).toBe('⏳ –')
})

test('a request that got no response (interrupted, failed) leaves the clock where it was', async ($, on) => {
  const { clock, r } = await session($, on)
  await ask($)
  await clock.advance(10 * MIN)
  r.usage = null
  await ask($)
  expect(await chip($)).toBe('⏳ 50m')
})

test("a subagent's request is another conversation's cache: the chip does not move", async ($, on) => {
  const { clock } = await session($, on)
  await ask($, { agentId: 'a1' })
  expect(await chip($)).toBe('⏳ –')
  await ask($)
  await clock.advance(10 * MIN)
  await ask($, { agentId: 'a1' })
  expect(await chip($)).toBe('⏳ 50m')
})

test('a cache belongs to one model: a request on another model drops the clock', async ($, on) => {
  const { clock, r } = await session($, on)
  await ask($)
  await clock.advance(10 * MIN)
  // the other model's request goes out and no response comes back: the old cache is no use to it
  r.usage = null
  await ask($, { model: OTHER })
  expect(await chip($)).toBe('⏳ –')
  // its response starts a clock of its own
  r.usage = READ
  await ask($, { model: OTHER })
  expect(await chip($)).toBe('⏳ 60m')
  // and back: the first model's cache is not the one the clock counts
  r.usage = null
  await ask($)
  expect(await chip($)).toBe('⏳ –')
})

test('a /clear (the session starts over) drops the clock', async ($, on) => {
  const { clock, r } = await session($, on)
  await ask($)
  await clock.advance(10 * MIN)
  expect(await chip($)).toBe('⏳ 50m')
  r.startedAt = START + 10 * MIN
  await clock.advance(15 * SEC)
  expect(await chip($)).toBe('⏳ –')
})

test('a compaction that stands drops the clock; a skip, a precompute and a subagent\'s own compaction do not', async ($, on) => {
  const { clock, r } = await session($, on)
  await ask($)
  await clock.advance(10 * MIN)
  const compact = (e: Record<string, unknown>) => $.session.compact({ messages: MSGS, trigger: 'manual', ...e } as never)

  await compact({ trigger: 'precompute' })
  expect(await chip($)).toBe('⏳ 50m')
  await compact({ agentId: 'a9' })
  expect(await chip($)).toBe('⏳ 50m')
  r.skipCompact = true
  await compact({})
  expect(await chip($)).toBe('⏳ 50m')

  r.skipCompact = false
  await compact({})
  expect(await chip($)).toBe('⏳ –')
  // the next response caches the shorter conversation and starts a new clock
  await ask($)
  expect(await chip($)).toBe('⏳ 60m')
})

// ── which lifetime: Claude Code's own order ──────────────────────────────────

const HOUR = '⏳ 60m'
const SHORT = '⏳ 5m'
for (const [name, over, want] of [
  ['a subscription with room: an hour', {}, HOUR],
  ['an API key (no plan windows): five minutes', { rateLimits: [] }, SHORT],
  ['the 5-hour window at 100% (usage credits): five minutes', { rateLimits: limits(100, 10) }, SHORT],
  ['the weekly window at 100%: five minutes', { rateLimits: limits(20, 100) }, SHORT],
  ['99% is still the plan: an hour', { rateLimits: limits(99, 99) }, HOUR],
  ['promptCacheTtl 1h in settings on an API key: an hour', { rateLimits: [], settings: { promptCacheTtl: '1h' } }, HOUR],
  ['promptCacheTtl 5m in settings on a subscription: five minutes', { settings: { promptCacheTtl: '5m' } }, SHORT],
  ['CLAUDE_CODE_PROMPT_CACHE_TTL beats settings (1h over 5m)', { rateLimits: [], env: { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' }, settings: { promptCacheTtl: '5m' } }, HOUR],
  ['CLAUDE_CODE_PROMPT_CACHE_TTL beats settings (5m over 1h)', { env: { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' }, settings: { promptCacheTtl: '1h' } }, SHORT],
  ['ENABLE_PROMPT_CACHING_1H on an API key: an hour', { rateLimits: [], env: { ENABLE_PROMPT_CACHING_1H: '1' } }, HOUR],
  ['settings beat ENABLE_PROMPT_CACHING_1H', { rateLimits: [], env: { ENABLE_PROMPT_CACHING_1H: '1' }, settings: { promptCacheTtl: '5m' } }, SHORT],
  ['FORCE_PROMPT_CACHING_5M beats everything', { env: { FORCE_PROMPT_CACHING_5M: '1', CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' }, settings: { promptCacheTtl: '1h' } }, SHORT],
  ['a value Claude Code ignores (2h) is ignored here too', { env: { CLAUDE_CODE_PROMPT_CACHE_TTL: '2h' }, settings: { promptCacheTtl: '1d' } }, HOUR],
  ['env and settings that cannot be read: the plan decides', { unreadable: true }, HOUR],
  ['...and without a plan: five minutes', { unreadable: true, rateLimits: [] }, SHORT],
] as [string, Partial<Rig>, string][]) {
  test(`lifetime: ${name}`, async ($, on) => {
    await session($, on, over)
    await ask($)
    expect(await chip($)).toBe(want)
  })
}

test('a five-minute lifetime counts down and colours on the same scale, and goes cold at five minutes', async ($, on) => {
  const { clock } = await session($, on, { rateLimits: [] })
  await ask($)
  let at = 0
  for (const [sec, text, key] of [
    [60, '⏳ 4m', undefined], // 20% spent
    [150, '⏳ 3m', undefined], // 50%
    [225, '⏳ 2m', 'warning'], // 75%
    [270, '⏳ 1m', 'error'], // 90%
  ] as const) {
    await clock.advance((sec - at) * SEC)
    at = sec
    expect(await chip($)).toBe(text)
    expect(await colour($)).toEqual(key === undefined ? [] : [[text.slice(2), key, false]])
  }
  await clock.advance(30 * SEC)
  expect(await chip($)).toBe('⏳ cold')
})

test('the lifetime is read again at each refresh: a setting changed mid-session counts', async ($, on) => {
  const { clock, r } = await session($, on)
  await ask($)
  expect(await chip($)).toBe(HOUR)
  r.settings = { promptCacheTtl: '5m' }
  await clock.advance(15 * SEC)
  // 15 seconds of the five minutes are gone: still "5m" by rounding up
  expect(await chip($)).toBe(SHORT)
})

// ── a narrow pane ────────────────────────────────────────────────────────────

test('a narrow pane draws the same chip; the tokens are not drawn there, so the speed ends the row', async ($, on) => {
  const { clock } = await session($, on, { rateLimits: [] })
  expect(await chip($, 'terminal', 60)).toBe('⏳ –')
  await ask($)
  expect(await row1($, 'terminal', 60)).toBe('opus-5-5 ● high ⏱ 0m ⏳ 5m ⚡ – t/s')
  await clock.advance(5 * MIN)
  expect(await chip($, 'terminal', 60)).toBe('⏳ cold')
})

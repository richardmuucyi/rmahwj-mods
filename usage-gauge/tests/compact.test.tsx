import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// The context meter around a compaction. The engine reports no context figure from a compaction until the next
// response, so the gauge must not keep the old one. It shows an estimate with a "~": the compaction's `tokensAfter`
// (the summary and the kept messages) plus the overhead the next response carries besides the conversation (system
// prompt, tools, memory files, skills), read from the engine's context breakdown. A dash when either is missing.

const HINT = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
const START = Date.parse('2026-10-13T10:00:00')
const WINDOW = 200_000
const MSGS = [{ role: 'user' as const, text: 'summary', toolUses: [] }]

type Context = { tokens?: number; window: number; percent?: number }
const HAD: Context = { tokens: 190_000, window: WINDOW, percent: 95 }
const NONE: Context = { window: WINDOW }

type Row = { name: string; tokens: number; kind: 'used' | 'free' | 'buffer' | 'deferred' }
/** A breakdown whose overhead is 20,000: the used rows besides Messages. Free space, the buffer and deferred tools are not in it. */
const ROWS: Row[] = [
  { name: 'System prompt', tokens: 6_000, kind: 'used' },
  { name: 'System tools', tokens: 10_000, kind: 'used' },
  { name: 'Memory files', tokens: 4_000, kind: 'used' },
  { name: 'Messages', tokens: 150_000, kind: 'used' },
  { name: 'Free space', tokens: 20_000, kind: 'free' },
  { name: 'Autocompact buffer', tokens: 33_000, kind: 'buffer' },
  { name: 'MCP tools (deferred)', tokens: 12_000, kind: 'deferred' },
]

type Rig = {
  context: Context
  after: number | undefined | 'skip'
  usageThrows: boolean
  /** The breakdown rows the engine answers with when asked; undefined: it answers without a breakdown. */
  rows: Row[] | undefined
  /** The `breakdown` argument of every session.usage call, in order (undefined: a call without one). */
  asked: (string | undefined)[]
}

const rig = (over: Partial<Rig> = {}): Rig => ({ context: HAD, after: 46_000, usageThrows: false, rows: ROWS, asked: [], ...over })

function breakdownOf(rows: Row[]) {
  return {
    categories: rows.map(x => ({ ...x, color: 'x', isDeferred: x.kind === 'deferred' })),
    totalTokens: rows.filter(x => x.kind === 'used').reduce((n, x) => n + x.tokens, 0),
    maxTokens: WINDOW,
    rawMaxTokens: WINDOW,
    percentage: 0,
  }
}

function bottom(on: On, r: Rig) {
  on('session.usage', (_$, e) => {
    const asked = (e as { breakdown?: string } | undefined)?.breakdown
    r.asked.push(asked)
    if (r.usageThrows) throw new Error('usage is not readable')
    const context: Record<string, unknown> = { ...r.context }
    if (asked !== undefined && r.rows !== undefined) context.breakdown = breakdownOf(r.rows)
    return { value: { startedAt: START, context, rateLimits: [] } as never }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-4-1-20250805' }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.compact', () => {
    if (r.after === 'skip') return { skip: 'off' } as never
    return { messages: MSGS, tokensBefore: 190_000, ...(r.after === undefined ? {} : { tokensAfter: r.after }) } as never
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine-own" />
  })
}

/** The context meter of the two rows under the prompt, e.g. "context ▰▰▱▱▱▱▱▱▱▱ ~23%". */
async function meter($: Engine, surface: 'terminal' | 'desktop' = 'terminal') {
  const band = await $.ui.mount({ plugin: 'usage-gauge', surface, component: 'PromptHint', props: HINT })
  const row = (await band.find({ key: 'ug-row2' }))?.text.replace(/\s+/g, ' ').trim() ?? ''
  await band.unmount()
  return row.split(' 5 hour')[0]
}

async function compact($: Engine, e: Record<string, unknown> = {}): Promise<{ messages?: unknown[]; tokensAfter?: number; skip?: string }> {
  return (await $.session.compact({ messages: MSGS, trigger: 'manual', ...e } as never)) as never
}

const start = ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') => $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })

/** 46,000 after the compaction + 20,000 overhead = 66,000 of 200,000 */
const EST = 'context ▰▰▰▱▱▱▱▱▱▱ ~33%'
const DASH = 'context ▱▱▱▱▱▱▱▱▱▱ –'

test('no figure from the engine and no compaction (a /clear): the old figure is not kept', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const r = rig()
  bottom(on, r)
  await start($)
  expect(await meter($)).toBe('context ▰▰▰▰▰▰▰▰▰▱ 95%')
  r.context = NONE
  await clock.advance(15_000)
  expect(await meter($)).toBe(DASH)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`after a compaction the meter shows tokensAfter plus the overhead, with a ~ (${surface})`, async ($, on) => {
    mock.clock(on, { now: START })
    const r = rig()
    bottom(on, r)
    await start($, surface)
    expect(await meter($, surface)).toBe('context ▰▰▰▰▰▰▰▰▰▱ 95%')
    r.context = NONE // the engine has no figure until the next response
    const result = await compact($)
    // the compaction itself reaches the engine as the bottom answered it
    expect(result.messages).toHaveLength(1)
    expect(result.tokensAfter).toBe(46_000)
    expect(await meter($, surface)).toBe(EST)
  })
}

test('the breakdown is asked for as a summary: a local estimate, never the full count that sends requests', async ($, on) => {
  mock.clock(on, { now: START })
  const r = rig()
  bottom(on, r)
  await start($)
  r.asked.length = 0
  r.context = NONE
  await compact($)
  expect(r.asked).toContain('summary')
  expect(r.asked).not.toContain('full')
})

test('only used rows besides Messages are overhead: not the conversation, free space, the buffer or deferred tools', async ($, on) => {
  mock.clock(on, { now: START })
  // every other row is huge, so any of them counted would push the estimate to the cap
  const rows: Row[] = [
    { name: 'System prompt', tokens: 20_000, kind: 'used' },
    { name: 'Messages', tokens: 900_000, kind: 'used' },
    { name: 'Free space', tokens: 900_000, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 900_000, kind: 'buffer' },
    { name: 'MCP tools (deferred)', tokens: 900_000, kind: 'deferred' },
  ]
  const r = rig({ rows })
  bottom(on, r)
  await start($)
  r.context = NONE
  await compact($)
  expect(await meter($)).toBe(EST)
})

test('the estimate stays through the gauge\'s own refresh while the engine still has no figure', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const r = rig()
  bottom(on, r)
  await start($)
  r.context = NONE
  await compact($)
  await clock.advance(15_000)
  expect(await meter($)).toBe(EST)
  await clock.advance(45_000)
  expect(await meter($)).toBe(EST)
})

test('the engine\'s real figure replaces the estimate: no ~', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const r = rig()
  bottom(on, r)
  await start($)
  r.context = NONE
  await compact($)
  expect(await meter($)).toBe(EST)
  // the next response arrives: the engine now answers with its own figure
  r.context = { tokens: 70_000, window: WINDOW, percent: 35 }
  await $.turn.complete({
    answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer',
    usage: { model: 'claude-opus-4-1-20250805', input_tokens: 1_000, output_tokens: 10, cache_read_input_tokens: 68_000, cache_creation_input_tokens: 1_000 },
  })
  expect(await meter($)).toBe('context ▰▰▰▱▱▱▱▱▱▱ 35%')
  // and the estimate does not come back at the next refresh
  await clock.advance(15_000)
  expect(await meter($)).toBe('context ▰▰▰▱▱▱▱▱▱▱ 35%')
})

test('a real figure after the estimate is not mistaken for an estimate once the engine goes quiet again', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const r = rig()
  bottom(on, r)
  await start($)
  r.context = NONE
  await compact($)
  r.context = { tokens: 70_000, window: WINDOW, percent: 35 }
  await clock.advance(15_000)
  expect(await meter($)).toBe('context ▰▰▰▱▱▱▱▱▱▱ 35%')
  // a /clear: no figure and no compaction. The 35% must not come back as the old figure, and no ~ is invented.
  r.context = NONE
  await clock.advance(15_000)
  expect(await meter($)).toBe(DASH)
})

test('the numbers of the 2026-10-13 compactions: 28,781 after + 98,000 overhead over 1M reads ~13%, the real 12.8%', async ($, on) => {
  mock.clock(on, { now: START })
  const rows: Row[] = [
    { name: 'System prompt', tokens: 9_000, kind: 'used' },
    { name: 'System tools', tokens: 20_000, kind: 'used' },
    { name: 'Memory files', tokens: 33_000, kind: 'used' },
    { name: 'Skills', tokens: 25_000, kind: 'used' },
    { name: 'Custom agents', tokens: 3_000, kind: 'used' },
    { name: 'MCP tools', tokens: 8_000, kind: 'used' },
    { name: 'Messages', tokens: 20_000, kind: 'used' },
  ]
  const r = rig({ context: { tokens: 596_296, window: 1_000_000, percent: 60 }, after: 28_781, rows })
  bottom(on, r)
  await start($)
  r.context = { window: 1_000_000 }
  await compact($)
  expect(await meter($)).toBe('context ▰▱▱▱▱▱▱▱▱▱ ~13%')
})

// ── a dash when a part is missing ─────────────────────────────────────────────

test('no tokensAfter from the engine: a dash, not the old figure', async ($, on) => {
  mock.clock(on, { now: START })
  const r = rig({ after: undefined })
  bottom(on, r)
  await start($)
  r.context = NONE
  await compact($)
  expect(await meter($)).toBe(DASH)
})

test('a tokensAfter of 0 is no figure: a dash', async ($, on) => {
  mock.clock(on, { now: START })
  const r = rig({ after: 0 })
  bottom(on, r)
  await start($)
  r.context = NONE
  await compact($)
  expect(await meter($)).toBe(DASH)
})

test('no breakdown from the engine: a dash, not tokensAfter alone', async ($, on) => {
  mock.clock(on, { now: START })
  const r = rig({ rows: undefined })
  bottom(on, r)
  await start($)
  r.context = NONE
  await compact($)
  expect(await meter($)).toBe(DASH)
})

test('a breakdown with no Messages row cannot be split into conversation and overhead: a dash', async ($, on) => {
  mock.clock(on, { now: START })
  const rows: Row[] = [
    { name: 'System prompt', tokens: 6_000, kind: 'used' },
    { name: 'System tools', tokens: 10_000, kind: 'used' },
    { name: 'Free space', tokens: 20_000, kind: 'free' },
  ]
  const r = rig({ rows })
  bottom(on, r)
  await start($)
  r.context = NONE
  await compact($)
  expect(await meter($)).toBe(DASH)
})

test('a breakdown with no overhead rows is no overhead: a dash, not tokensAfter alone', async ($, on) => {
  mock.clock(on, { now: START })
  const rows: Row[] = [
    { name: 'Messages', tokens: 150_000, kind: 'used' },
    { name: 'Free space', tokens: 20_000, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 33_000, kind: 'buffer' },
  ]
  const r = rig({ rows })
  bottom(on, r)
  await start($)
  r.context = NONE
  await compact($)
  expect(await meter($)).toBe(DASH)
})

test('a window of 0 gives no estimate: a dash', async ($, on) => {
  mock.clock(on, { now: START })
  const r = rig()
  bottom(on, r)
  await start($)
  r.context = { window: 0 }
  await compact($)
  expect(await meter($)).toBe(DASH)
})

test('usage cannot be read when the compaction ends: it still goes through, and the meter reads a dash', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const r = rig()
  bottom(on, r)
  await start($)
  r.context = NONE
  r.usageThrows = true
  const result = await compact($)
  expect(result.messages).toHaveLength(1)
  expect(result.tokensAfter).toBe(46_000)
  r.usageThrows = false
  await clock.advance(1) // nothing to refresh yet: the gauge was not told anything
  expect(await meter($)).toBe(DASH)
})

// ── the sum ──────────────────────────────────────────────────────────────────

test('a sum above the window stops at 100%', async ($, on) => {
  mock.clock(on, { now: START })
  const r = rig({ after: 250_000 })
  bottom(on, r)
  await start($)
  r.context = NONE
  await compact($)
  expect(await meter($)).toBe('context ▰▰▰▰▰▰▰▰▰▰ ~100%')
})

test('the estimate is rounded to the nearest whole percent', async ($, on) => {
  mock.clock(on, { now: START })
  const r = rig({ after: 3_900 }) // + 20,000 = 23,900 of 200,000 = 11.95%
  bottom(on, r)
  await start($)
  r.context = NONE
  await compact($)
  expect(await meter($)).toBe('context ▰▱▱▱▱▱▱▱▱▱ ~12%')
})

test('the window comes from the session, not a fixed 200K', async ($, on) => {
  mock.clock(on, { now: START })
  const r = rig({ context: { tokens: 700_000, window: 1_000_000, percent: 70 } })
  bottom(on, r)
  await start($)
  r.context = { window: 1_000_000 } // 66,000 of 1,000,000 = 6.6%
  await compact($)
  expect(await meter($)).toBe('context ▱▱▱▱▱▱▱▱▱▱ ~7%')
})

// ── which compactions count ──────────────────────────────────────────────────

for (const trigger of ['manual', 'auto', 'plugin'] as const) {
  test(`compaction by ${trigger} that stands gives an estimate`, async ($, on) => {
    mock.clock(on, { now: START })
    const r = rig()
    bottom(on, r)
    await start($)
    r.context = NONE
    await compact($, { trigger })
    expect(await meter($)).toBe(EST)
  })
}

test('a compaction that is skipped changes nothing: the figure stays', async ($, on) => {
  mock.clock(on, { now: START })
  const r = rig({ after: 'skip' })
  bottom(on, r)
  await start($)
  const result = await compact($)
  expect(result.skip).toBe('off')
  expect(await meter($)).toBe('context ▰▰▰▰▰▰▰▰▰▱ 95%')
})

test('a precompute installs nothing: the figure stays', async ($, on) => {
  mock.clock(on, { now: START })
  const r = rig()
  bottom(on, r)
  await start($)
  await compact($, { trigger: 'precompute' })
  expect(await meter($)).toBe('context ▰▰▰▰▰▰▰▰▰▱ 95%')
})

test('a subagent\'s own compaction is not this session\'s: the figure stays', async ($, on) => {
  mock.clock(on, { now: START })
  const r = rig()
  bottom(on, r)
  await start($)
  await compact($, { trigger: 'auto', agentId: 'a9' })
  expect(await meter($)).toBe('context ▰▰▰▰▰▰▰▰▰▱ 95%')
})

test('a real figure of 0% is drawn as 0%, not as a dash', async ($, on) => {
  mock.clock(on, { now: START })
  const r = rig({ context: { tokens: 3_000, window: 1_000_000, percent: 0 }, after: undefined })
  bottom(on, r)
  await start($)
  expect(await meter($)).toBe('context ▱▱▱▱▱▱▱▱▱▱ 0%')
})

import { expect, mock, test } from 'claude-code/testing'
import type { Engine, On } from 'claude-code/testing'

// An API key, a cloud provider or a gateway has no plan: the session reports no 5-hour or weekly window, ever. Before the
// first turn the meters wait with a dash, as they do for a plan whose figures have not come yet; once a turn has ended
// with no window reported they go, and row 2 is the context meter alone. A window that turns up later (a /login onto a
// plan) brings its meters back.

const HINT = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
const START = Date.parse('2026-10-23T10:00:00')
const MODEL = 'claude-opus-4-1-20250805'

type Limit = { kind: string; percentUsed: number; resetsAt?: string }
const PLAN: Limit[] = [
  { kind: 'five_hour', percentUsed: 71, resetsAt: '2026-10-23T14:40:00' },
  { kind: 'seven_day', percentUsed: 18, resetsAt: '2026-10-29T09:00:00' },
]

/** A session whose reported windows the test can change; returns the setter. */
function bottom(on: On, first: Limit[]): (next: Limit[]) => void {
  let rateLimits = first
  on('session.usage', () => ({ value: { startedAt: START, context: { tokens: 84_000, window: 200_000, percent: 42 }, rateLimits, cost: { usd: 1.25 } } as never }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: MODEL }))
  on('env.get', () => ({ value: undefined }))
  on('settings.read', () => ({ value: {} }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine-own" />
  })
  return next => {
    rateLimits = next
  }
}

async function row2($: Engine, surface: 'terminal' | 'desktop', columns?: number): Promise<string> {
  const band = await $.ui.mount({
    plugin: 'usage-gauge', surface, component: 'PromptHint', props: HINT,
    ...(columns === undefined ? {} : { viewport: { columns, rows: 30 } }),
  })
  const text = (await band.find({ key: 'ug-row2' }))?.text.replace(/\s+/g, ' ').trim() ?? ''
  await band.unmount()
  return text
}

const turn = ($: Engine, isAborted = false) =>
  $.turn.complete({
    answer: 'Hi!', durationMs: 2000, isAborted, turnId: 't1', reason: 'answer',
    usage: { model: MODEL, input_tokens: 1_000, output_tokens: 124, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as never)

const WAITING = 'context ▰▰▰▰▱▱▱▱▱▱ 42% 84k 5 hour ▱▱▱▱▱▱▱▱▱▱ – weekly ▱▱▱▱▱▱▱▱▱▱ –'
const CONTEXT_ONLY = 'context ▰▰▰▰▱▱▱▱▱▱ 42% 84k'
const WITH_PLAN = 'context ▰▰▰▰▱▱▱▱▱▱ 42% 84k 5 hour ▰▰▰▰▰▰▰▱▱▱ 71% ↻ 2:40pm weekly ▰▱▱▱▱▱▱▱▱▱ 18% ↻ Thu 29 Oct 9am'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`no plan: the limit meters wait for the first turn, then go (${surface})`, async ($, on) => {
    mock.clock(on, { now: START })
    bottom(on, [])
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })
    expect(await row2($, surface)).toBe(WAITING)
    await turn($)
    expect(await row2($, surface)).toBe(CONTEXT_ONLY)
    // Narrow, the same: the short label, and nothing after it.
    expect(await row2($, surface, 80)).toBe('ctx ▰▰▰▰▱▱▱▱▱▱ 42% 84k')
  })

  test(`no plan: a turn stopped before any reply hides nothing (${surface})`, async ($, on) => {
    mock.clock(on, { now: START })
    bottom(on, [])
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })
    await turn($, true)
    expect(await row2($, surface)).toBe(WAITING)
  })

  test(`no plan, then a plan: windows that turn up later bring the meters back (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const setLimits = bottom(on, [])
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })
    await turn($)
    expect(await row2($, surface)).toBe(CONTEXT_ONLY)
    setLimits(PLAN)
    await clock.advance(15_000)
    expect(await row2($, surface)).toBe(WITH_PLAN)
  })

  test(`a plan: the meters stay after a turn (${surface})`, async ($, on) => {
    mock.clock(on, { now: START })
    bottom(on, PLAN)
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })
    await turn($)
    expect(await row2($, surface)).toBe(WITH_PLAN)
  })
}

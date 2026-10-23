import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// What the person selected (/model, /effort, env and settings) against what each main request sends. A difference is
// drawn on the chip, in the theme's warning colour, as "selected → sent"; a subagent's request is never compared.

const HINT = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
const START = Date.parse('2026-10-23T10:00:00')
const BLUE = '#6a9bcc'
const ORANGE = '#d97757'
const DARK = '#141413'
type Chip = [string, string, string]

function chipsOf(node: unknown, out: Chip[] = []): Chip[] {
  const n = node as { props?: { backgroundColor?: string; color?: string }; children?: unknown[] } | string | undefined
  if (n === undefined || typeof n === 'string') return out
  if (n.props?.backgroundColor) out.push([n.props.backgroundColor, (n.children ?? []).filter(c => typeof c === 'string').join(''), n.props.color ?? ''])
  else for (const c of n.children ?? []) chipsOf(c, out)
  return out
}

async function chips($: Engine): Promise<Chip[]> {
  const band = await $.ui.mount({ plugin: 'usage-gauge', surface: 'terminal', component: 'PromptHint', props: HINT })
  const out = chipsOf(await band.find({ key: 'ug-row1' }))
  await band.unmount()
  return out
}

type Pick = { model: string; env?: string; settings: Record<string, unknown> }

/** An engine whose selection is whatever `pick` holds when the mod asks. */
function engine(on: On, pick: Pick) {
  const clock = mock.clock(on, { now: START })
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine-own" />
  })
  on('session.model', () => ({ value: pick.model }))
  on('env.get', (_$, e) => ({ value: e.name ==='CLAUDE_CODE_EFFORT_LEVEL' ? pick.env : undefined }))
  on('settings.read', () => ({ value: pick.settings }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as never, usage: { input_tokens: 10, output_tokens: 1 } } as never
  })
  return clock
}

async function send($: Engine, model: string, effort?: string, agentId?: string) {
  const s = $.turn.step({ turnId: 't1', index: 0, model, ...(effort ? { effort: effort as never } : {}), messageCount: 1, ...(agentId ? { agentId } : {}) })
  for await (const _ of s) {
    // drain
  }
}

const PER_MODEL = { effortLevel: 'xhigh', modelSettings: { 'claude-opus-5-5': { effortLevel: 'high' }, 'claude-sonnet-5-5': { effortLevel: 'medium' } } }

test('before the first request the per-model effort wins over the top-level one', async ($, on) => {
  engine(on, { model: 'claude-opus-5-5', settings: PER_MODEL })
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  expect(await chips($)).toEqual([[BLUE, ' claude-opus-5-5 ', DARK], [ORANGE, ' ● high ', DARK]])
})

test('the env variable wins over both settings', async ($, on) => {
  engine(on, { model: 'claude-opus-5-5', env: 'max', settings: PER_MODEL })
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  expect(await chips($)).toEqual([[BLUE, ' claude-opus-5-5 ', DARK], [ORANGE, ' ◈ max ', DARK]])
})

test('a request that sends what was selected: the plain chips', async ($, on) => {
  engine(on, { model: 'claude-opus-5-5', settings: PER_MODEL })
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  await send($, 'claude-opus-5-5', 'high')
  expect(await chips($)).toEqual([[BLUE, ' claude-opus-5-5 ', DARK], [ORANGE, ' ● high ', DARK]])
})

test('a request on another model: the model chip turns warning and names both', async ($, on) => {
  engine(on, { model: 'claude-opus-5-5', settings: PER_MODEL })
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  await send($, 'claude-sonnet-5-5', 'high')
  expect(await chips($)).toEqual([['warning', ' opus-5-5 → sonnet-5-5 ', DARK], [ORANGE, ' ● high ', DARK]])
})

test('a request with a lower effort than selected: the effort chip turns warning and names both', async ($, on) => {
  engine(on, { model: 'claude-opus-5-5', env: 'xhigh', settings: PER_MODEL })
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  await send($, 'claude-opus-5-5', 'high')
  expect(await chips($)).toEqual([[BLUE, ' claude-opus-5-5 ', DARK], ['warning', ' ◉ xhigh → ● high ', DARK]])
})

test('an alias or a display name selects the model it names: no mismatch', async ($, on) => {
  const pick: Pick = { model: 'opus', settings: PER_MODEL }
  engine(on, pick)
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  // The alias finds the one per-model entry it names.
  await send($, 'claude-opus-5-5', 'high')
  expect(await chips($)).toEqual([[BLUE, ' claude-opus-5-5 ', DARK], [ORANGE, ' ● high ', DARK]])
  for (const m of ['Opus 5.5', 'claude-opus-5-5[1m]', 'claude-opus-5-5-20261001', 'default']) {
    pick.model = m
    await send($, 'claude-opus-5-5', 'high')
    expect((await chips($))[0]).toEqual([BLUE, ' claude-opus-5-5 ', DARK])
  }
})

test('a subagent on another model and effort is not compared', async ($, on) => {
  engine(on, { model: 'claude-opus-5-5', settings: PER_MODEL })
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  await send($, 'claude-opus-5-5', 'high')
  await send($, 'claude-haiku-5-5', 'low', 'agent-1')
  expect(await chips($)).toEqual([[BLUE, ' claude-opus-5-5 ', DARK], [ORANGE, ' ● high ', DARK]])
})

test('a /model switch is checked at the next request, and a request that matches clears the warning', async ($, on) => {
  const pick: Pick = { model: 'claude-opus-5-5', settings: PER_MODEL }
  engine(on, pick)
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  await send($, 'claude-sonnet-5-5', 'medium')
  expect((await chips($))[0]?.[0]).toBe('warning')
  // The person switches to sonnet: the chip keeps what was sent until a request goes out, and the 15 s refresh does
  // not overwrite it with the selection.
  pick.model = 'claude-sonnet-5-5'
  await send($, 'claude-sonnet-5-5', 'medium')
  expect(await chips($)).toEqual([[BLUE, ' claude-sonnet-5-5 ', DARK], [ORANGE, ' ◐ medium ', DARK]])
})

test('a request without an effort (a model that takes none) is not an effort mismatch', async ($, on) => {
  engine(on, { model: 'claude-opus-5-5', settings: PER_MODEL })
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  await send($, 'claude-opus-5-5')
  expect((await chips($)).map(c => c[0])).toEqual([BLUE, ORANGE])
})

test('a token budget sent as the effort is not compared with a selected level', async ($, on) => {
  engine(on, { model: 'claude-opus-5-5', env: 'xhigh', settings: PER_MODEL })
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  await send($, 'claude-opus-5-5', 3 as never)
  expect((await chips($)).map(c => c[0])).toEqual([BLUE, ORANGE])
})

test('after a resume or reload (session.start again) the selection is read afresh and each request still checked', async ($, on) => {
  const pick: Pick = { model: 'claude-opus-5-5', settings: PER_MODEL }
  engine(on, pick)
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  await send($, 'claude-sonnet-5-5', 'high')
  expect((await chips($))[0]?.[0]).toBe('warning')
  // The session comes back on sonnet: the new pick shows at once, in the plain colours, with sonnet's own effort.
  pick.model = 'claude-sonnet-5-5'
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  expect(await chips($)).toEqual([[BLUE, ' claude-sonnet-5-5 ', DARK], [ORANGE, ' ◐ medium ', DARK]])
  await send($, 'claude-sonnet-5-5', 'medium')
  expect(await chips($)).toEqual([[BLUE, ' claude-sonnet-5-5 ', DARK], [ORANGE, ' ◐ medium ', DARK]])
  // ...and a later request off the selection is marked again.
  await send($, 'claude-opus-5-5', 'medium')
  expect((await chips($))[0]).toEqual(['warning', ' sonnet-5-5 → opus-5-5 ', DARK])
})

test('between requests the 15 s refresh shows a new /model or /effort pick in the plain colours, never as a mismatch', async ($, on) => {
  const pick: Pick = { model: 'claude-opus-5-5', settings: PER_MODEL }
  const clock = engine(on, pick)
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  await send($, 'claude-opus-5-5', 'high')
  // /effort max for this model, then a pause: the next refresh shows it, orange, before any request.
  pick.settings = { ...PER_MODEL, modelSettings: { ...PER_MODEL.modelSettings, 'claude-opus-5-5': { effortLevel: 'max' } } }
  await clock.advance(15_000)
  expect(await chips($)).toEqual([[BLUE, ' claude-opus-5-5 ', DARK], [ORANGE, ' ◈ max ', DARK]])
  // /model sonnet: the model chip shows it blue, and the effort follows sonnet's own entry.
  pick.model = 'claude-sonnet-5-5'
  await clock.advance(15_000)
  expect(await chips($)).toEqual([[BLUE, ' claude-sonnet-5-5 ', DARK], [ORANGE, ' ◐ medium ', DARK]])
  // The next request is held to the new pick as usual.
  await send($, 'claude-opus-5-5', 'medium')
  expect((await chips($))[0]).toEqual(['warning', ' sonnet-5-5 → opus-5-5 ', DARK])
})

test('a refresh with no new pick keeps the mismatch the last request showed', async ($, on) => {
  const clock = engine(on, { model: 'claude-opus-5-5', env: 'xhigh', settings: PER_MODEL })
  await $.session.start({ cwd: '/v', surface: 'terminal', isInteractive: true })
  await send($, 'claude-sonnet-5-5', 'high')
  await clock.advance(15_000)
  expect(await chips($)).toEqual([['warning', ' opus-5-5 → sonnet-5-5 ', DARK], ['warning', ' ◉ xhigh → ● high ', DARK]])
})

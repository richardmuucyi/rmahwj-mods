import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const HINT = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
const START = Date.parse('2026-10-13T10:00:00')

async function rows($: Engine, surface: 'terminal' | 'desktop') {
  const band = await $.ui.mount({ plugin: 'usage-gauge', surface, component: 'PromptHint', props: HINT })
  const text = async (key: string) => (await band.find({ key }))?.text.replace(/\s+/g, ' ').trim() ?? ''
  const out = { r1: await text('ug-row1'), r2: await text('ug-row2'), own: await band.find({ key: 'engine-own' }) }
  await band.unmount()
  return out
}

const BLUE = '#6a9bcc'
const ORANGE = '#d97757'
const DARK = '#141413'
/** One coloured block: [background, text, text colour]. */
type Chip = [string, string, string]

/** The coloured blocks of a drawn element, left to right. */
function chipsOf(node: unknown, out: Chip[] = []): Chip[] {
  const n = node as { props?: { backgroundColor?: string; color?: string }; children?: unknown[] } | string | undefined
  if (n === undefined || typeof n === 'string') return out
  if (n.props?.backgroundColor) out.push([n.props.backgroundColor, (n.children ?? []).filter(c => typeof c === 'string').join(''), n.props.color ?? ''])
  else for (const c of n.children ?? []) chipsOf(c, out)
  return out
}

/** The model and effort chips as drawn now: the only coloured blocks in row 1 (find sees top-level keys, so not `ug-chip`). */
async function chips($: Engine, surface: 'terminal' | 'desktop'): Promise<Chip[]> {
  const band = await $.ui.mount({ plugin: 'usage-gauge', surface, component: 'PromptHint', props: HINT })
  const out = chipsOf(await band.find({ key: 'ug-row1' }))
  await band.unmount()
  return out
}

/** Text drawn in a colour of its own, left to right: [text, colour, bold]. The chips (they carry a background) and empty text are not in it. */
function colouredOf(node: unknown, out: [string, string, boolean][] = []): [string, string, boolean][] {
  const n = node as { props?: { color?: string; backgroundColor?: string; bold?: boolean }; children?: unknown[] } | string | undefined
  if (n === undefined || typeof n === 'string') return out
  const text = (n.children ?? []).filter(c => typeof c === 'string').join('')
  if (n.props?.color && !n.props.backgroundColor) {
    if (text) out.push([text, n.props.color, n.props.bold === true])
  } else for (const c of n.children ?? []) colouredOf(c, out)
  return out
}

/** What one of the two rows draws in a colour of its own. */
async function coloured($: Engine, surface: 'terminal' | 'desktop', key: 'ug-row1' | 'ug-row2'): Promise<[string, string, boolean][]> {
  const band = await $.ui.mount({ plugin: 'usage-gauge', surface, component: 'PromptHint', props: HINT })
  const out = colouredOf(await band.find({ key }))
  await band.unmount()
  return out
}

const FILL = 'rate_limit_fill'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`two rows: model + effort, time and cache, cost, speed; three meters with resets (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: START + 72 * 60_000 })
    let fiveHour = 71
    on('session.usage', () => ({
      value: {
        startedAt: START,
        context: { tokens: 84_000, window: 200_000, percent: 42 },
        rateLimits: [
          { kind: 'five_hour', percentUsed: fiveHour, resetsAt: '2026-10-13T14:40:00' },
          { kind: 'seven_day', percentUsed: 18, resetsAt: '2026-10-19T09:00:00' },
        ],
        cost: { usd: 3.84 },
      },
    }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('session.model', () => ({ value: 'claude-opus-4-1-20250805' }))
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    on('ui.render', ($, e) => {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box key="engine-own">
          <Text>engine</Text>
        </Box>
      )
    })
    // The model streams for 2 s and reports 124 output tokens: 62 t/s.
    on('turn.step', async function* ($, e) {
      yield { kind: 'text', index: 0, text: 'Hi' } as never
      await clock.advance(2_000)
      yield { kind: 'text', index: 0, text: '!' } as never
      return {
        turnId: e.turnId, index: e.index, answer: 'Hi!', toolUses: [], stopReason: 'end_turn' as never,
        usage: { input_tokens: 1_000, output_tokens: 124, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 9_000 },
      }
    })

    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })
    const s = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-4-1-20250805', effort: 'high', messageCount: 1 })
    for await (const _ of s) {
      // drain
    }
    await $.turn.complete({
      answer: 'Hi!', durationMs: 2000, isAborted: false, turnId: 't1', reason: 'answer',
      usage: { model: 'claude-opus-4-1-20250805', input_tokens: 1_000, output_tokens: 124, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 9_000 },
    })

    let r = await rows($, surface)
    // The cache sits in the clock chip, after the session time: the request cached, and 2 s of the hour went on the reply
    // (rounded up, still 60m). 90k of the 100k input came from the cache: 90%.
    expect(r.r1).toBe('claude-opus-4-1-20250805 ● high ⏱ 1h 12m ⏳ 60m 90% $3.84 ⚡ 62 t/s')
    expect(r.r2).toBe('context ▰▰▰▰▱▱▱▱▱▱ 42% 84k 5 hour ▰▰▰▰▰▰▰▱▱▱ 71% ↻ 2:40pm weekly ▰▱▱▱▱▱▱▱▱▱ 18% ↻ Mon 19 Oct 9am')
    // The engine's own hint line stays, beneath the rows.
    expect(r.own).toBeDefined()

    // Cost, speed and the cache rate are plain text: no colour of their own (the chips carry theirs on a background).
    expect(await coloured($, surface, 'ug-row1')).toEqual([])
    // The meters use Claude Code's theme keys: its own bar fill below 70%, warning from 70%.
    expect(await coloured($, surface, 'ug-row2')).toEqual([
      ['▰▰▰▰', FILL, false], [' 42%', FILL, true],
      ['▰▰▰▰▰▰▰', 'warning', false], [' 71%', 'warning', true],
      ['▰', FILL, false], [' 18%', FILL, true],
    ])

    // A limit at 90%+ fills its meter.
    fiveHour = 94
    await clock.advance(15_000)
    r = await rows($, surface)
    // 94% fills nine cells: the bar is only full at 100%.
    expect(r.r2).toBe('context ▰▰▰▰▱▱▱▱▱▱ 42% 84k 5 hour ▰▰▰▰▰▰▰▰▰▱ 94% ↻ 2:40pm weekly ▰▱▱▱▱▱▱▱▱▱ 18% ↻ Mon 19 Oct 9am')
    // ...and is drawn in the theme's error colour.
    expect((await coloured($, surface, 'ug-row2'))[2]).toEqual(['▰▰▰▰▰▰▰▰▰', 'error', false])
  })

  test(`the context meter shows the tokens after the percent; none without a figure (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: START })
    let context: Record<string, unknown> = { tokens: 305_000, window: 1_000_000, percent: 31 }
    on('session.usage', () => ({ value: { startedAt: START, context, rateLimits: [] } as never }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('ui.render', ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box key="engine-own" />
    })
    on('session.model', () => ({ value: 'claude-opus-4-1-20250805' }))
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })

    /** The context meter alone: row 2 up to the 5 hour meter, whitespace folded. */
    const meterAt = async (columns: number): Promise<string> => {
      const band = await $.ui.mount({ plugin: 'usage-gauge', surface, component: 'PromptHint', props: HINT, viewport: { columns, rows: 30 } })
      const text = (await band.find({ key: 'ug-row2' }))?.text.replace(/\s+/g, ' ').trim() ?? ''
      await band.unmount()
      return text.split(columns < 90 ? ' 5h' : ' 5 hour')[0]
    }
    const set = async (c: Record<string, unknown>) => {
      context = c
      await clock.advance(15_000)
    }

    // The session board's old chip said "ctx 305K"; the gauge draws the same count, in its own style (305k).
    expect(await meterAt(120)).toBe('context ▰▰▰▱▱▱▱▱▱▱ 31% 305k')
    // A narrow pane: the short label, the count stays.
    expect(await meterAt(60)).toBe('ctx ▰▰▰▱▱▱▱▱▱▱ 31% 305k')
    // The count is plain text, not a colour of its own: only the bar and the percent are coloured.
    expect((await coloured($, surface, 'ug-row2')).map(c => c[0]).join('')).not.toContain('305k')

    await set({ tokens: 1_234_567, window: 2_000_000, percent: 62 })
    expect(await meterAt(120)).toBe('context ▰▰▰▰▰▰▱▱▱▱ 62% 1.2M')
    await set({ tokens: 3_000, window: 1_000_000, percent: 0 })
    expect(await meterAt(120)).toBe('context ▱▱▱▱▱▱▱▱▱▱ 0% 3.0k')

    // A percent with no token count: the percent alone. No figure at all: the dash.
    await set({ window: 200_000, percent: 40 })
    expect(await meterAt(120)).toBe('context ▰▰▰▰▱▱▱▱▱▱ 40%')
    await set({ window: 200_000 })
    expect(await meterAt(120)).toBe('context ▱▱▱▱▱▱▱▱▱▱ –')
  })

  test(`meter colours change at 70% and 90%, and a real 0% keeps the fill colour (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: START })
    let pct = 0
    on('session.usage', () => ({
      value: { startedAt: START, context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: pct, resetsAt: '2026-10-13T14:40:00' }] },
    }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('ui.render', ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box key="engine-own" />
    })
    on('session.model', () => ({ value: 'claude-opus-4-1-20250805' }))
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })

    // [percent, colour of the 5 hour meter's % number]
    for (const [p, key] of [[0, FILL], [69, FILL], [70, 'warning'], [89, 'warning'], [90, 'error'], [100, 'error']] as const) {
      pct = p
      await clock.advance(15_000)
      const pctText = (await coloured($, surface, 'ug-row2')).find(c => c[0] === ` ${p}%`)
      expect(pctText).toEqual([` ${p}%`, key, true])
    }
  })

  test(`before the first request: model and starting effort, a dash for the cache, no cost, speed or cache rate (${surface})`, async ($, on) => {
    mock.clock(on, { now: START })
    on('session.usage', () => ({ value: { startedAt: START, context: { window: 200_000 }, rateLimits: [] } }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('ui.render', ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box key="engine-own" />
    })
    on('session.model', () => ({ value: 'claude-sonnet-4-5-20250929' }))
    on('env.get', () => ({ value: undefined }))
    on('settings.read', () => ({ value: { effortLevel: 'xhigh' } }))
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })
    const r = await rows($, surface)
    expect(r.r1).toBe('claude-sonnet-4-5-20250929 ◉ xhigh ⏱ 0m ⏳ –')
    expect(r.r2).toBe('context ▱▱▱▱▱▱▱▱▱▱ – 5 hour ▱▱▱▱▱▱▱▱▱▱ – weekly ▱▱▱▱▱▱▱▱▱▱ –')
  })

  test(`chips: brand blue model, brand orange effort, dark text, one symbol per level (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: START })
    let level: string | undefined
    on('session.usage', () => ({ value: { startedAt: START, context: { window: 200_000 }, rateLimits: [] } }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('ui.render', ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box key="engine-own" />
    })
    on('session.model', () => ({ value: 'claude-opus-4-1-20250805' }))
    on('env.get', () => ({ value: undefined }))
    on('settings.read', () => ({ value: { effortLevel: level } }))
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })

    const model: Chip = [BLUE, ' claude-opus-4-1-20250805 ', DARK]
    // No effort known yet: the model chip alone.
    expect(await chips($, surface)).toEqual([model])

    // Every level: the same orange, the level is the symbol (Claude Code's own: ○ ◐ ● ◉ ◈).
    for (const [name, glyph] of [['low', '○'], ['medium', '◐'], ['high', '●'], ['xhigh', '◉'], ['max', '◈']]) {
      level = name
      await clock.advance(15_000)
      expect(await chips($, surface)).toEqual([model, [ORANGE, ` ${glyph} ${name} `, DARK]])
    }

    // A level with no symbol is its name alone, never a wrong shape; the colours do not change.
    level = 'turbo'
    await clock.advance(15_000)
    expect(await chips($, surface)).toEqual([model, [ORANGE, ' turbo ', DARK]])
  })
}

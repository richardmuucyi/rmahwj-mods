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

for (const surface of ['terminal', 'desktop'] as const) {
  test(`two rows: model + effort, time, cost, speed, tokens; three meters with resets (${surface})`, async ($, on) => {
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
    expect(r.r1).toBe('claude-opus-4-1-20250805 high ⏱ 1h 12m $3.84 ⚡ 62 t/s in 100k out 124')
    expect(r.r2).toBe('context ▰▰▰▰▱▱▱▱▱▱ 42% 5 hour ▰▰▰▰▰▰▰▱▱▱ 71% ↻ 2:40pm weekly ▰▱▱▱▱▱▱▱▱▱ 18% ↻ Mon 19 Oct 9am')
    // The engine's own hint line stays, beneath the rows.
    expect(r.own).toBeDefined()

    // A limit at 90%+ fills its meter.
    fiveHour = 94
    await clock.advance(15_000)
    r = await rows($, surface)
    // 94% fills nine cells: the bar is only full at 100%.
    expect(r.r2).toBe('context ▰▰▰▰▱▱▱▱▱▱ 42% 5 hour ▰▰▰▰▰▰▰▰▰▱ 94% ↻ 2:40pm weekly ▰▱▱▱▱▱▱▱▱▱ 18% ↻ Mon 19 Oct 9am')
  })

  test(`before the first request: model and starting effort, no cost, speed or tokens (${surface})`, async ($, on) => {
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
    expect(r.r1).toBe('claude-sonnet-4-5-20250929 xhigh ⏱ 0m')
    expect(r.r2).toBe('context ▱▱▱▱▱▱▱▱▱▱ – 5 hour ▱▱▱▱▱▱▱▱▱▱ – weekly ▱▱▱▱▱▱▱▱▱▱ –')
  })
}

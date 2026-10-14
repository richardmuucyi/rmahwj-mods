import { expect, test } from 'claude-code/testing'

const draw = (text: string, origin: Record<string, unknown>) => ({ text, origin, isExpanded: true }) as never
type M = { findAll: (q: { type: 'Text' }) => Promise<{ text: string }[]> }
const rowsOf = async (m: M) => (await m.findAll({ type: 'Text' })).map(x => x.text).filter(x => /^(❯ |▌ | {2})/.test(x)).map(x => x.trimEnd())

for (const surface of ['terminal', 'desktop'] as const) {
  test(`your prompt is a tinted row; other rows keep the engine's look (${surface})`, async ($, on) => {
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text key="engine-own">engine</Text>
    })
    const mine = await $.ui.mount({ plugin: 'prompt-style', surface, component: 'UserMessage', props: draw('fix the login test, then run it', { kind: 'composer' }) })
    expect((await rowsOf(mine))[0]).toBe('❯ fix the login test, then run it')
    expect((await mine.findAll({ type: 'Text' })).some(x => x.text === 'engine')).toBe(false)
    await mine.unmount()

    // A slash command you typed is styled too.
    const cmd = await $.ui.mount({ plugin: 'prompt-style', surface, component: 'UserMessage', props: draw('/reload-plugins', { kind: 'composer' }) })
    expect((await rowsOf(cmd))[0]).toBe('❯ /reload-plugins')
    await cmd.unmount()

    // A command echo stored with no stamp, plain or in its stored form.
    for (const raw of ['/reload-plugins', '<command-name>/reload-plugins</command-name>\n<command-args></command-args>']) {
      const echo = await $.ui.mount({ plugin: 'prompt-style', surface, component: 'UserMessage', props: draw(raw, { kind: 'unclassified' }) })
      expect((await rowsOf(echo))[0]).toBe('❯ /reload-plugins')
      await echo.unmount()
    }
    // An unstamped row that is not a command: untouched.
    const odd = await $.ui.mount({ plugin: 'prompt-style', surface, component: 'UserMessage', props: draw('idle notice', { kind: 'unclassified' }) })
    expect(await rowsOf(odd)).toEqual([])
    await odd.unmount()

    // A long prompt wraps over several tinted rows.
    const long = await $.ui.mount({ plugin: 'prompt-style', surface, component: 'UserMessage', props: draw('word '.repeat(60).trim(), { kind: 'composer' }) })
    expect((await rowsOf(long)).length).toBeGreaterThanOrEqual(3)
    await long.unmount()

    // A background task's report and a plugin's prompt: untouched.
    for (const [text, origin] of [
      ['<task-notification> done', { kind: 'task-notification' }],
      ['<task-notification> done', { kind: 'sdk' }],
      ['Go ahead with the brief above.', { kind: 'plugin', name: 'prompt-enhancer', asUser: true }],
    ] as const) {
      const other = await $.ui.mount({ plugin: 'prompt-style', surface, component: 'UserMessage', props: draw(text, origin) })
      expect(await rowsOf(other)).toEqual([])
      expect((await other.findAll({ type: 'Text' })).some(x => x.text === 'engine')).toBe(true)
      await other.unmount()
    }
  })
}

test('an outline palette draws a bar, no background', { options: { style: 'outline', colour: '🟦 blue' } }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const m = await $.ui.mount({ plugin: 'prompt-style', surface: 'terminal', component: 'UserMessage', props: draw('hello', { kind: 'composer' }) })
  expect((await rowsOf(m))[0]).toBe('▌ hello')
  const drawn = JSON.stringify(await m.drawn())
  expect(drawn).toContain('#60a5fa')
  expect(drawn).not.toContain('backgroundColor')
  await m.unmount()
})

test('a light palette is the default', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const m = await $.ui.mount({ plugin: 'prompt-style', surface: 'terminal', component: 'UserMessage', props: draw('hello', { kind: 'composer' }) })
  expect(JSON.stringify(await m.drawn())).toContain('#fef3c7')
  await m.unmount()
})

test('dark row + purple', { options: { style: 'dark row', colour: '🟪 purple' } }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const m = await $.ui.mount({ plugin: 'prompt-style', surface: 'terminal', component: 'UserMessage', props: draw('hello', { kind: 'composer' }) })
  expect(JSON.stringify(await m.drawn())).toContain('#2e1a47')
  await m.unmount()
})

test('/prompt-colours previews every style and colour, the current one marked', { options: { style: 'dark row', colour: '🟩 green' } }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const m = await $.ui.mount({ plugin: 'prompt-style', surface: 'terminal', component: 'CommandOutput', props: { command: 'prompt-colours', args: '', text: '', isErrored: false } as never })
  const t = (await m.findAll({ type: 'Text' })).map(x => x.text.trimEnd())
  for (const s of ['light row', 'dark row', 'outline']) expect(t).toContain(s)
  expect(t.filter(x => /^(❯ |▌ )\S+ (yellow|green|blue|purple|orange|red|grey|brown)$/.test(x)).length).toBe(24)
  expect(t.filter(x => x.trim() === '◀').length).toBe(1)
  const drawn = JSON.stringify(await m.drawn())
  expect(drawn).toContain('#13322a')
  await m.unmount()
})

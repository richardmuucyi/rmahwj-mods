import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

/** What reached the engine beneath the mod: the text and the hidden context. */
function bottom(on: Parameters<TestBody>[1]) {
  const seen: { text: string; context: readonly string[] }[] = []
  on('prompt.submit', (_$, e) => {
    seen.push({ text: e.text, context: e.context ?? [] })
    return { text: e.text }
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  return seen
}
const kindOf = (context: readonly string[]) => {
  const c = context.join('\n')
  return c.includes('into a /goal condition') ? 'goal' : c.includes('into a /loop command') ? 'loop' : c.includes('Before doing any work') ? 'brief' : 'none'
}

test('++g and ++l are short for ++goal and ++loop; the long forms still work', async ($, on) => {
  const seen = bottom(on)
  for (const [typed, kind, text] of [
    ['++g make the auth tests pass', 'goal', 'make the auth tests pass'],
    ['++G make the auth tests pass', 'goal', 'make the auth tests pass'],
    ['++l check CI on my PR', 'loop', 'check CI on my PR'],
    ['++goal make the auth tests pass', 'goal', 'make the auth tests pass'],
    ['++loop: check CI on my PR', 'loop', 'check CI on my PR'],
  ] as const) {
    await $.prompt.submit({ text: typed, origin: { kind: 'composer' }, wait: false })
    const last = seen[seen.length - 1]!
    expect([typed, kindOf(last.context), last.text]).toEqual([typed, kind, text])
  }
})

test('a letter that starts a word is not a short form: those stay briefs', async ($, on) => {
  const seen = bottom(on)
  for (const [typed, text] of [
    ['++ go ahead with the fix', 'go ahead with the fix'],
    ['++go ahead with the fix', 'go ahead with the fix'],
    ['++loose ideas for the page', 'loose ideas for the page'],
    ['++ g is a letter', 'g is a letter'],
  ] as const) {
    await $.prompt.submit({ text: typed, origin: { kind: 'composer' }, wait: false })
    const last = seen[seen.length - 1]!
    expect([typed, kindOf(last.context), last.text]).toEqual([typed, 'brief', text])
  }
})

test('++g with no request is sent as typed', async ($, on) => {
  const seen = bottom(on)
  await $.prompt.submit({ text: '++g', origin: { kind: 'composer' }, wait: false })
  expect(seen[0]).toEqual({ text: '++g', context: [] })
})

for (const [command, prefix] of [
  ['goalify', '++goal'],
  ['loopify', '++loop'],
  ['clarify', '++'],
] as const) {
  test(`/${command} puts "${prefix} <request>" in the prompt box for you to send`, async ($, on) => {
    bottom(on)
    let box = ''
    const toasts: string[] = []
    on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
    on('prompt.fill', (_$, e) => {
      box = e.text
      return { ...e, isFilled: true }
    })
    on('ui.toast', (_$, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    const clock = mock.clock(on)
    const r = await $.command.run({ command, args: 'make the auth tests pass', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
    expect(JSON.stringify(r)).toContain('press Enter to start')
    await clock.settle()
    expect(box).toBe('') // not yet: the box is filled just after the command clears it
    await clock.advance(100)
    expect(box).toBe(`${prefix} make the auth tests pass`)
    // your own words in the box are never replaced
    box = 'my half-typed note'
    await $.command.run({ command, args: 'another request', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
    await clock.advance(100)
    expect(box).toBe('my half-typed note')
    expect(toasts.at(-1)).toBe(`Your prompt box has text: type ${prefix} another request yourself`)
  })
}

test('/goalify with no request names both prefixes', async ($, on) => {
  bottom(on)
  const r = await $.command.run({ command: 'goalify', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(JSON.stringify(r)).toContain('start a prompt with ++goal (or ++g)')
})

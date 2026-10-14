import { expect, test } from 'claude-code/testing'

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}
const fold = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

for (const surface of ['terminal', 'desktop'] as const) {
  test(`++, ++goal and ++loop: instruction attached, draft shown as labelled parts (${surface})`, async ($, on) => {
    const seen: { text: string; context: readonly string[] }[] = []
    let box = ''
    const ran: string[] = []
    let turn = 0
    on('prompt.submit', (_$, e) => {
      seen.push({ text: e.text, context: e.context ?? [] })
      return { text: e.text }
    })
    on('prompt.fill', (_$, e) => {
      box = e.text
      return { ...e, isFilled: true }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    on('command.run', (_$, e) => {
      ran.push(`${e.command} ${e.args}`)
      return { text: '' }
    })
    on('ui.render', ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box key="engine-own" />
    })
    const reply = (answer: string) =>
      $.turn.complete({ answer, durationMs: 1000, isAborted: false, turnId: `t${++turn}`, reason: 'answer' })
    const card = async () => {
      const band = await $.ui.mount({ plugin: 'prompt-enhancer', surface, component: 'AbovePrompt', props: BAND })
      return { band, text: fold((await band.find({ key: 'pe-ready' }))?.text) }
    }

    // A plain prompt is untouched.
    await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })
    expect(seen[0]).toEqual({ text: 'hello', context: [] })

    // ++: clarify instruction; the brief becomes a card with labelled rows.
    await $.prompt.submit({ text: '++ fix the login bug', origin: { kind: 'composer' }, wait: false })
    expect(seen[1]!.text).toBe('fix the login bug')
    expect(seen[1]!.context.join('\n')).toContain('Before doing any work')
    await reply('Here is the brief.\n```brief\ngoal: users can log in with SSO again\nscope: login page only; not signup\nconstraints: none\ndone: SSO login works in the dev build\n```')
    let c = await card()
    expect(c.text).toContain('BRIEF')
    expect(c.text).toContain('Goal users can log in with SSO again')
    expect(c.text).toContain('Done when SSO login works')
    expect(c.text).not.toContain('Constraints')
    await c.band.press({ key: 'pe-go' })
    expect(seen[seen.length - 1]!.text).toBe('Go ahead with the brief above.')
    await c.band.unmount()

    // ++goal: the condition lands in the box; the card shows its parts.
    await $.prompt.submit({ text: '++goal make the auth tests pass', origin: { kind: 'composer' }, wait: false })
    expect(seen[seen.length - 1]!.context.join('\n')).toContain('ask another round. At most 3 rounds')
    await reply(
      'Keeps going until the auth tests pass.\n```goal\nnpm test -- test/auth exits 0, no other test file changed, or stop after 15 turns\n```\n```parts\nend: all auth tests pass\ncheck: npm test -- test/auth exits 0\nkeep: no other test file changed\nlimit: stop after 15 turns\n```',
    )
    expect(box).toBe('/goal npm test -- test/auth exits 0, no other test file changed, or stop after 15 turns')
    c = await card()
    expect(c.text).toContain('GOAL READY')
    expect(c.text).toContain('End state all auth tests pass')
    expect(c.text).toContain('Limit stop after 15 turns')
    expect(c.text).not.toContain('⚠')
    await c.band.press({ key: 'pe-start' })
    expect(ran).toEqual(['goal npm test -- test/auth exits 0, no other test file changed, or stop after 15 turns'])
    await c.band.unmount()

    // ++loop without a stop condition: the gap is flagged.
    await $.prompt.submit({ text: '++loop watch the deploy', origin: { kind: 'composer' }, wait: false })
    await reply(
      'Checks the deploy.\n```loop\n5m check the deploy status and report it\n```\n```parts\nevery: 5m\ncheck: the deploy status\nif: report it\nnever: none\n```',
    )
    expect(box).toBe('/loop 5m check the deploy status and report it')
    c = await card()
    expect(c.text).toContain('LOOP READY')
    expect(c.text).toContain('Every 5m')
    expect(c.text).toContain('⚠ no stop condition')
    await c.band.press({ key: 'pe-edit' })
    expect(box).toBe('/loop 5m check the deploy status and report it')
    await c.band.unmount()
  })
}

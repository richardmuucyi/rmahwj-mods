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
// A condition in the shape the ++goal instruction asks for (tested 2026-10-18).
const GOAL =
  'Done when either: (A) npm test -- test/auth exits 0 in a run after the last edit, its output quoted in the reply, and git diff --stat lists only src/auth; or (B) after 15 "Stop hook feedback" messages, a reply ends "GOAL CAPPED: <what is left>". Either one alone ends the goal. End each reply with "Goal turn N/15" (N = those messages + 1).'

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
    on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
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
    const goalContext = seen[seen.length - 1]!.context.join('\n')
    expect(goalContext).toContain('ask another round. At most 3 rounds')
    expect(goalContext).toContain('Done when either: (A) <end state>; or (B) after K "Stop hook feedback" messages')
    expect(goalContext).toContain('Either one alone ends the goal. End each reply with "Goal turn N/K"')
    expect(goalContext).toContain('offer to run the check once now')
    // the fixes measured in the 2026-10-18 draft test
    expect(goalContext).toContain('Copy the (B) sentence word for word, with your number in place of both Ks')
    expect(goalContext).toContain('saves its start value to a file first')
    expect(goalContext).toContain("a fresh reviewer subagent's quoted verdict")
    await reply(
      'Keeps going until the auth tests pass.\n```goal\n' +
        GOAL +
        '\n```\n```parts\nend: all auth tests pass\ncheck: npm test -- test/auth exits 0\nkeep: only src/auth changes\nlimit: 15 goal checks, then GOAL CAPPED\n```',
    )
    expect(box).toBe(`/goal ${GOAL}`)
    c = await card()
    expect(c.text).toContain('GOAL READY')
    expect(c.text).toContain('End state all auth tests pass')
    expect(c.text).toContain('Limit 15 goal checks, then GOAL CAPPED')
    expect(c.text).toContain('the judge reads only this chat · a reached cap also counts as achieved')
    expect(c.text).not.toContain('⚠')
    await c.band.press({ key: 'pe-start' })
    expect(ran).toEqual([`goal ${GOAL}`])
    expect(box).toBe('') // Start cleared the draft it had put in the box
    await c.band.unmount()

    // The old shape ("or stop after 15 turns") is flagged: nothing counts turns.
    await $.prompt.submit({ text: '++goal make the auth tests pass', origin: { kind: 'composer' }, wait: false })
    await reply(
      'Old shape.\n```goal\nnpm test -- test/auth exits 0, or stop after 15 turns\n```\n```parts\nend: auth tests pass\ncheck: npm test\nkeep: none\nlimit: stop after 15 turns\n```',
    )
    c = await card()
    expect(c.text).toContain('⚠ turn cap with no printed count: nothing counts turns, so it never trips')
    await c.band.press({ key: 'pe-dismiss' })
    await c.band.unmount()
    box = ''

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
    expect(c.text).toContain('⚠ no one-line report for a quiet pass')
    expect(c.text).toContain('runs only while this session is open and idle · ends after 7 days')
    await c.band.press({ key: 'pe-edit' })
    expect(box).toBe('/loop 5m check the deploy status and report it')
    await c.band.unmount()
  })
}

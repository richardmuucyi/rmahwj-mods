import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}
// On Windows the engine hands fs hooks backslash paths: key the fake folders by forward slashes.
const posix = (p: string) => p.replace(/\\/g, '/')

/** The engine beneath the mod: a prompt box, toasts, what reached Claude, and a skills folder in memory. */
function bottom(on: Parameters<TestBody>[1], files = new Map<string, string>(), opts: { noBox?: boolean } = {}) {
  const r = { box: '', toasts: [] as string[], seen: [] as { text: string; context: readonly string[] }[] }
  on('prompt.submit', (_$, e) => {
    r.seen.push({ text: e.text, context: e.context ?? [] })
    return { text: e.text }
  })
  on('prompt.fill', (_$, e) => {
    r.box = e.text
    return { ...e, isFilled: true }
  })
  on('prompt.read', () => (opts.noBox ? { deny: 'no prompt box on this surface' } : { value: { text: r.box, cursor: r.box.length } }))
  on('ui.toast', (_$, e) => {
    r.toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine-own" />
  })
  on('session.root', () => ({ value: 'C:\\work\\vault' }))
  on('env.get', (_$, e) => ({ value: e.name === 'USERPROFILE' ? 'D:\\home\\dev' : undefined }))
  on('fs.list', (_$, e) => {
    const dir = `${posix(e.path)}/`
    const names = new Set([...files.keys()].filter(k => k.startsWith(dir)).map(k => k.slice(dir.length).split('/')[0]!))
    return { value: [...names].map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', (_$, e) => {
    const text = files.get(posix(e.path))
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  return r
}
const reply = ($: Parameters<TestBody>[0], answer: string, n = 1) =>
  $.turn.complete({ answer, durationMs: 1000, isAborted: false, turnId: `t${n}`, reason: 'answer' })
const hasCard = async ($: Parameters<TestBody>[0]) => {
  const b = await $.ui.mount({ plugin: 'prompt-enhancer', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const found = Boolean(await b.find({ key: 'pe-ready' }))
  await b.unmount()
  return found
}

const fold = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
const mount = ($: Parameters<TestBody>[0]) =>
  $.ui.mount({ plugin: 'prompt-enhancer', surface: 'terminal', component: 'AbovePrompt', props: BAND })

// A panel in the line format its instruction asks for, with a list marker and bold to drop.
const PANEL =
  "1. Instructional designer: maps the tasks a new hire does in week one; methods: task analysis, Bloom's levels\n" +
  '2. **Technical writer**: turns each task into numbered steps; methods: plain-language review, readability score\n' +
  '3. Support lead: lists the ten questions new hires ask most; methods: ticket tag counts\n' +
  '4. Usability tester (critic): watches two people follow it cold; methods: think-aloud test, task success rate\n' +
  '5. Security reviewer (critic): checks every step for leaked secrets and unsafe defaults; methods: secret scan, least-privilege review'
const ANSWER = `Here is the panel.\n\`\`\`panel\n${PANEL}\n\`\`\``
const GO =
  "Go ahead with the panel above: do the work with their methods, not their voices. Run each method with your tools where you can, and show its real result (its output, a count, a quote); if one cannot run here, say so in one line rather than describe a result. If a search finds nothing, widen it before you say a file does not exist. Where the panel left a choice open, take the safest option and name it. Run the two critics' methods after the final text is written, on that text, and report what they found and what you changed."

for (const surface of ['terminal', 'desktop'] as const) {
  test(`++panel: the five experts come back as a card; nothing starts until ▶ Go, which sends the work rules (${surface})`, async ($, on) => {
    const r = bottom(on)
    await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
    expect(r.seen[0]!.text).toBe('write the onboarding guide')
    const instruction = r.seen[0]!.context.join('\n')
    // the owner's prompt, with his pause in place of "Then do that work"
    expect(instruction).toContain(
      "pick the five experts from different fields who would make this outstanding, including two whose job is to find what's wrong with it. For each one, tell me what they would actually do and which methods they would use. Do not start the work in this turn",
    )
    expect(instruction).not.toContain('Then do that work')
    expect(instruction).toContain('Name each by field, not as an invented person')
    expect(instruction).toContain('Pick methods you can carry out here')
    expect(instruction).toContain('fenced code block tagged panel')
    expect(instruction).toContain('"(critic)" after it for the two critics')
    expect(instruction).toContain("When I say go, do the work. Don't role-play them, use their methods.")
    expect(instruction).toContain("Run the two critics' methods after the final text is written, on that text, not only on the plan or a first draft")
    expect(instruction).toContain('Keep the deliverable I asked for')
    // the fixes from the live trial (2026-10-19)
    expect(instruction).toContain('ask me with AskUserQuestion before you write the panel. The panel reply itself asks nothing')
    expect(instruction).toContain('One line per expert, under 200 characters')
    expect(instruction).toContain('("think-aloud test", not "best practices")')
    expect(instruction).toContain('Run each method with your tools where you can, and show its real result (its output, a count, a quote); if a method cannot run here, say so in one line')
    expect(instruction).toContain('If a search finds nothing, widen it before you say a file does not exist.')

    await reply($, ANSWER)
    expect(r.box).toBe('') // a panel waits on the card: nothing goes in the box
    expect(r.toasts).toEqual([])
    const b = await $.ui.mount({ plugin: 'prompt-enhancer', surface, component: 'AbovePrompt', props: BAND })
    const text = fold((await b.find({ key: 'pe-ready' }))?.text)
    expect(text).toContain('PANEL')
    expect(text).toContain('nothing starts until you say go')
    // the methods sit beside the field, always whole; what the expert would do follows
    expect(text).toContain("🛠 Instructional designer methods: task analysis, Bloom's levels maps the tasks a new hire does in week one")
    expect(text).toContain('🛠 Technical writer methods: plain-language review, readability score turns each task') // list marker and bold dropped
    expect(text).toContain('🔎 Usability tester · critic methods: think-aloud test, task success rate watches two people follow it cold')
    expect(text).toContain('🔎 Security reviewer · critic methods: secret scan, least-privilege review checks every step')
    expect(text).toContain('Go starts the work with their methods · the critics check the finished result')
    expect(text).not.toContain('⚠')
    for (const key of ['pe-go', 'pe-correct', 'pe-dismiss']) expect(Boolean(await b.find({ key }))).toBe(true)

    await b.press({ key: 'pe-go' })
    expect(r.seen.at(-1)).toEqual({ text: GO, context: [] })
    expect(Boolean(await b.find({ key: 'pe-ready' }))).toBe(false)
    await b.unmount()
  })
}

test('✎ Correct puts "Correction to the panel: " in the box; sent, it asks for all five again, and the revised panel is a new card', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: '++p write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  await reply($, ANSWER)
  let b = await mount($)
  await b.press({ key: 'pe-correct' })
  expect(r.box).toBe('Correction to the panel: ')
  expect(Boolean(await b.find({ key: 'pe-ready' }))).toBe(false)
  await b.unmount()
  await $.prompt.submit({ text: 'Correction to the panel: swap the support lead for a new hire', origin: { kind: 'composer' }, wait: false })
  expect(r.seen.at(-1)!.text).toBe('Correction to the panel: swap the support lead for a new hire')
  expect(r.seen.at(-1)!.context.join('\n')).toContain('reply with all five again in a fenced code block tagged panel')
  const revised = PANEL.replace('3. Support lead: lists the ten questions new hires ask most', '3. Recent new hire: reads the draft on day one')
  await reply($, `Revised.\n\`\`\`panel\n${revised}\n\`\`\``, 2)
  b = await mount($)
  expect(fold((await b.find({ key: 'pe-ready' }))?.text)).toContain('🛠 Recent new hire methods: ticket tag counts reads the draft on day one')
  await b.unmount()
})

test('✎ Correct leaves your own words in the box; a correction typed while the card waits still comes back as a card', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  await reply($, ANSWER)
  r.box = 'note to self'
  let b = await mount($)
  await b.press({ key: 'pe-correct' })
  expect(r.box).toBe('note to self')
  expect(r.toasts.at(-1)).toBe('Your prompt box has text: clear it, then press ✎ Correct again')
  expect(Boolean(await b.find({ key: 'pe-ready' }))).toBe(true)
  await b.unmount()
  // typed by hand while the card waits: the instruction asks for "my corrections", so this is one
  await $.prompt.submit({ text: 'Correction to the panel: more security', origin: { kind: 'composer' }, wait: false })
  expect(r.seen.at(-1)!.context.join('\n')).toContain('reply with all five again in a fenced code block tagged panel')
  b = await mount($)
  expect(Boolean(await b.find({ key: 'pe-ready' }))).toBe(false) // the old card is settled
  await b.unmount()
  await reply($, `Revised.\n\`\`\`panel\n${PANEL.replace('Support lead', 'Penetration tester')}\n\`\`\``, 2)
  b = await mount($)
  expect(fold((await b.find({ key: 'pe-ready' }))?.text)).toContain('🛠 Penetration tester')
  await b.unmount()
})

test('what the reply says outside the panel block shows on the card: the re-check assumption is visible before Go', async ($, on) => {
  bottom(on)
  await $.prompt.submit({ text: '++p plan my AWS study evenings', origin: { kind: 'composer' }, wait: false })
  // the line from the live re-check (2026-10-19): 194 characters, under the warning, and it changes the plan
  const assumption =
    "Assumption (correct me if wrong): your 21:00–22:00 block only fits 10 hours over 10 weekdays (Oct 19–30), so I'll plan for 1.5× playback and a few evening overflow slots between 19:30 and 20:30."
  await reply($, `\`\`\`panel\n${PANEL}\n\`\`\`\n\n${assumption}`)
  let b = await mount($)
  let text = fold((await b.find({ key: 'pe-ready' }))?.text)
  expect(text).toContain(`💬 Also said ${assumption}`)
  expect(text).not.toContain('⚠') // short: shown, not warned about
  await b.unmount()
  // a reply with nothing outside the block has no note row
  await $.prompt.submit({ text: '++p plan my AWS study evenings', origin: { kind: 'composer' }, wait: false })
  await reply($, `\`\`\`panel\n${PANEL}\n\`\`\``, 2)
  b = await mount($)
  expect(Boolean(await b.find({ key: 'pe-note' }))).toBe(false)
  await b.unmount()
})

test('"Correction to the panel" with no panel waiting or being drafted goes as typed', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: 'Correction to the panel: more security', origin: { kind: 'composer' }, wait: false })
  expect(r.seen.at(-1)).toEqual({ text: 'Correction to the panel: more security', context: [] })
})

test('✎ Correct on a prompt box that cannot be read changes nothing and says so; the card stays', async ($, on) => {
  const r = bottom(on, new Map(), { noBox: true })
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  await reply($, ANSWER)
  r.box = 'my own half-typed note'
  const b = await mount($)
  await b.press({ key: 'pe-correct' })
  expect(r.box).toBe('my own half-typed note')
  expect(r.toasts.at(-1)).toBe('Could not read the prompt box: type "Correction to the panel:" and your correction yourself')
  expect(Boolean(await b.find({ key: 'pe-ready' }))).toBe(true)
  await b.unmount()
})

test('real-world panel replies: methods split off, long text outside the block flagged, a typed /skill not flagged', async ($, on) => {
  bottom(on, new Map([['C:/work/vault/.claude/skills/tutor/SKILL.md', '---\nname: tutor\ndisable-model-invocation: true\n---\n']]))
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  const lines = PANEL.replace(
    '3. Support lead: lists the ten questions new hires ask most; methods: ticket tag counts',
    '3. Trainer: uses the Feynman method: explain each step simply; methods: you type /tutor yourself, spaced recall',
  )
  await reply($, `Before the panel, a question: which of these tools will you use? ${'Some background on each option. '.repeat(12)}\n\`\`\`panel\n${lines}\n\`\`\``)
  const b = await mount($)
  const text = fold((await b.find({ key: 'pe-ready' }))?.text)
  // the last "methods:" splits the line, so "the Feynman method:" stays in what they would do
  expect(text).toContain('🛠 Trainer methods: you type /tutor yourself, spaced recall uses the Feynman method: explain each step simply')
  expect(text).toContain('⚠ the reply says more outside the panel: read it before Go, it may ask something or start the work')
  expect(text).not.toContain('/tutor is user-only')
  await b.unmount()
})

test('your own go-ahead, typed, settles the panel card', async ($, on) => {
  bottom(on)
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  await reply($, ANSWER)
  await $.prompt.submit({ text: 'go', origin: { kind: 'composer' }, wait: false })
  expect(await hasCard($)).toBe(false)
})

test('the card flags a panel that is not five experts, two critics, different fields, each with methods', async ($, on) => {
  bottom(on, new Map([['C:/work/vault/.claude/skills/tutor/SKILL.md', '---\nname: tutor\ndisable-model-invocation: true\n---\n']]))
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  await reply(
    $,
    '```panel\nTechnical writer: writes it; methods: plain-language review\nTechnical writer: edits it; methods: style guide\nTrainer: runs it with /tutor\nUsability tester (critic): tests it; methods: think-aloud test\n```',
  )
  const b = await mount($)
  const text = fold((await b.find({ key: 'pe-ready' }))?.text)
  expect(text).toContain('⚠ 4 experts, not five')
  expect(text).toContain('⚠ 1 marked as critics, not two')
  expect(text).toContain('⚠ Technical writer appears twice: the fields should differ')
  expect(text).toContain('⚠ Trainer: no methods named')
  expect(text).toContain('⚠ /tutor is user-only: Claude cannot call it, so you type it')
  await b.unmount()
})

test('++p is short for ++panel; "++ panel notes", "++panels" and "++please" stay briefs', async ($, on) => {
  const r = bottom(on)
  const kindOf = (context: readonly string[]) => {
    const c = context.join('\n')
    return c.includes('pick the five experts') ? 'panel' : c.includes('deeper version of my request') ? 'deep' : c.includes('Before doing any work') ? 'brief' : 'other'
  }
  for (const [typed, kind, text] of [
    ['++p write the onboarding guide', 'panel', 'write the onboarding guide'],
    ['++P write the onboarding guide', 'panel', 'write the onboarding guide'],
    ['++panel write the onboarding guide', 'panel', 'write the onboarding guide'],
    ['++PANEL: write the onboarding guide', 'panel', 'write the onboarding guide'],
    ['++d write the onboarding guide', 'deep', 'write the onboarding guide'],
    ['++ panel notes from the meeting', 'brief', 'panel notes from the meeting'],
    ['++panels for the dashboard', 'brief', 'panels for the dashboard'],
    ['++please tidy the notes', 'brief', 'please tidy the notes'],
    ['++ p is a letter', 'brief', 'p is a letter'],
  ] as const) {
    await $.prompt.submit({ text: typed, origin: { kind: 'composer' }, wait: false })
    const last = r.seen.at(-1)!
    expect([typed, kindOf(last.context), last.text]).toEqual([typed, kind, text])
  }
  // nothing after it: sent as typed
  await $.prompt.submit({ text: '++p', origin: { kind: 'composer' }, wait: false })
  expect(r.seen.at(-1)).toEqual({ text: '++p', context: [] })
})

test('a ++panel reply with no panel block is no card, even with goal or brief blocks; it replaces a draft still waiting', async ($, on) => {
  const r = bottom(on)
  // a ++goal draft is waiting when you start a panel instead
  await $.prompt.submit({ text: '++goal make the tests pass', origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  await reply($, 'Not a panel.\n```goal\nDone when either: (A) x; or (B) y\n```\n```brief\ngoal: x\nscope: y\ndone: z\n```')
  expect(await hasCard($)).toBe(false)
  expect(r.box).toBe('')
})

test('++panel names the user-only skills, as methods you type yourself', async ($, on) => {
  const r = bottom(on, new Map([['C:/work/vault/.claude/skills/tutor/SKILL.md', '---\nname: tutor\ndisable-model-invocation: true\n---\n']]))
  await $.prompt.submit({ text: '++panel teach me the auth flow', origin: { kind: 'composer' }, wait: false })
  expect(r.seen.at(-1)!.context.join('\n')).toContain(
    'User-only skills here (Claude cannot call them): /tutor. If a method needs one, say in one line that I must type it myself',
  )
})

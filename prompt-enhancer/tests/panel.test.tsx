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
// Elsewhere a drive-letter stand-in is not absolute, so the engine resolves it against the working
// folder (/…/prompt-enhancer/C:/work/vault/…): drop that prefix to reach the same key.
const posix = (p: string) => p.replace(/\\/g, '/').replace(/^\/.*?\/(?=[A-Za-z]:\/)/, '')

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
  '4. Usability tester (critic): watches two people follow it cold; methods: think-aloud test, task success rate; nearest step: a fresh subagent follows it; cannot measure: where a person gets lost\n' +
  '5. Security reviewer (critic): checks every step for leaked secrets and unsafe defaults; methods: secret scan, least-privilege review\n' +
  '6. Done when, new hire ("write the onboarding guide"): they finish onboarding with the guide: say what the product is for and set up the dev machine; test: they follow it cold, run by you\n' +
  '7. **Done when (agent)**: a fresh agent does the same setup from the guide alone; test: cold-start run, run by me'
const ANSWER = `Here is the panel.\n\`\`\`panel\n${PANEL}\n\`\`\``
// the fixed part of what ▶ Go sends; your request follows it word for word
const GO_HEAD =
  "Go ahead with the panel above: do the work with their methods, not their voices. Run each method with your tools where you can, and show its real result (its output, a count, a quote); if one cannot run here, say so in one line rather than describe a result. Where a method ran as its nearest step, report the result as that step's and repeat what it cannot measure. If a search finds nothing, widen it before you say a file does not exist. Where the panel left a choice open, take the safest option and name it. Run the two critics' methods after the final text is written, on that text, and report what they found and what you changed. Before you finish, run each done-when test you can, report pass or fail with its result, and list each one you could not run and who must run it."
const TRACE_RULE =
  'Before your final reply, give a fresh subagent only my request, word for word, and the finished result, and have it write one row per thing my request asks for: my words, where the result meets them (a short quote), and present, partly or absent. Add the person mark yourself: "person: yes" only when a person checked that need, "person: no" when a person should and did not, "person: n/a" when no person is involved. End with the rows in a fenced code block tagged trace: "<my words>" | <where the result meets it, quoted> | present / partly / absent | person: yes / no / n/a. Never mark present what the subagent did not find.'
const GO = (request: string) =>
  `${GO_HEAD} Give my request below, word for word, to every subagent you use, and have the critics judge the result against it, not only against the plan. ${TRACE_RULE}\n\nMy request, word for word:\n<<<\n${request}\n>>>`

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
    expect(instruction).toContain('Pick methods that test what each reader needs')
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
    // 2026-10-21: a swapped method says what it cannot measure; every reader gets a done-when test
    expect(instruction).toContain('name the nearest step you can do, and say what that step cannot measure')
    expect(instruction).toContain('Name every reader of the result')
    expect(instruction).toContain('not only the one you can test here')
    expect(instruction).toContain('Each done-when line starts "Done when, <reader> ("<my words about that reader>"):"')
    // 2026-10-21 replay and review: the person's test quotes the request, a person runs it, and the work traces back to it
    expect(instruction).toContain('quotes, in double quotes, the words of my request that say what that reader needs')
    expect(instruction).toContain("A person's test is run by a person")
    expect(instruction).toContain('In those lines "the owner" is me and "Claude" is you')
    expect(instruction).toContain('Give my request, word for word, to every subagent you use')
    expect(instruction).toContain('judge it against my request')
    expect(instruction).toContain('give a fresh subagent only my request, word for word, and the finished result')
    expect(instruction).toContain('Never mark present what the subagent did not find')
    expect(instruction).toContain('a test that checks those very words')
    expect(instruction).toContain('a stated limit never replaces that')
    expect(instruction).toContain("report the result as that step's and repeat what it cannot measure beside it")
    expect(instruction).toContain('Before you finish, run each done-when test you can, report pass or fail')

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
    // the swap and its limit get a row of their own, in full, so the card never cuts the limit off
    expect(text).toContain('↳ nearest step: a fresh subagent follows it · cannot measure: where a person gets lost')
    expect(text).toContain('🔎 Security reviewer · critic methods: secret scan, least-privilege review checks every step')
    // the done-when lines are readers' tests, not experts: one row each, list marker and bold dropped
    expect(text).toContain(
      '✓ Done when · new hire “write the onboarding guide” they finish onboarding with the guide: say what the product is for and set up the dev machine; test: they follow it cold, run by you',
    )
    expect(text).toContain('✓ Done when · agent a fresh agent does the same setup from the guide alone; test: cold-start run, run by me')
    expect(text).toContain('Go starts the work with their methods · the critics check the finished result')
    expect(text).not.toContain('⚠')
    for (const key of ['pe-go', 'pe-correct', 'pe-dismiss']) expect(Boolean(await b.find({ key }))).toBe(true)

    await b.press({ key: 'pe-go' })
    // your request goes with Go, word for word, and the work must end with a trace back to it
    expect(r.seen.at(-1)).toEqual({ text: GO('write the onboarding guide'), context: [] })
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
  expect(r.seen.at(-1)!.context.join('\n')).toContain('reply with all five again, and the done-when lines, in a fenced code block tagged panel')
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
  expect(r.seen.at(-1)!.context.join('\n')).toContain('reply with all five again, and the done-when lines, in a fenced code block tagged panel')
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
  // the done-when quote must come from this request
  const AWS = PANEL.replace('("write the onboarding guide")', '(implied)')
  await $.prompt.submit({ text: '++p plan my AWS study evenings', origin: { kind: 'composer' }, wait: false })
  // the line from the live re-check (2026-10-19): 194 characters, under the warning, and it changes the plan
  const assumption =
    "Assumption (correct me if wrong): your 21:00–22:00 block only fits 10 hours over 10 weekdays (Oct 19–30), so I'll plan for 1.5× playback and a few evening overflow slots between 19:30 and 20:30."
  await reply($, `\`\`\`panel\n${AWS}\n\`\`\`\n\n${assumption}`)
  let b = await mount($)
  let text = fold((await b.find({ key: 'pe-ready' }))?.text)
  expect(text).toContain(`💬 Also said ${assumption}`)
  expect(text).not.toContain('⚠') // short: shown, not warned about
  await b.unmount()
  // a reply with nothing outside the block has no note row
  await $.prompt.submit({ text: '++p plan my AWS study evenings', origin: { kind: 'composer' }, wait: false })
  await reply($, `\`\`\`panel\n${AWS}\n\`\`\``, 2)
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

// The usability critic from the 2026-10-20 onboarding run, word for word: a subagent stood in for
// people and nothing said what it could not measure, so the runbook was judged by agents alone.
const SWAPPED =
  '4. Usability tester (critic): has a fresh agent use only the runbook to fix a real closed bug; methods: cold-start task success, stall-point log (a human think-aloud needs a person; a fresh subagent is the nearest step)'

test('a method swapped for a nearer step is flagged until it says what that step cannot measure', async ($, on) => {
  bottom(on)
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  const swapped = PANEL.replace(/^4\. Usability tester.*$/m, SWAPPED)
  await reply($, `\`\`\`panel\n${swapped}\n\`\`\``)
  let b = await mount($)
  let text = fold((await b.find({ key: 'pe-ready' }))?.text)
  expect(text).toContain('⚠ Usability tester: names a nearer step but not what it cannot measure')
  await b.unmount()
  // the same line with its limit stated passes
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  const stated = PANEL.replace(/^4\. Usability tester.*$/m, `${SWAPPED}; cannot measure: whether a person gets oriented`)
  await reply($, `\`\`\`panel\n${stated}\n\`\`\``, 2)
  b = await mount($)
  text = fold((await b.find({ key: 'pe-ready' }))?.text)
  expect(text).toContain('cannot measure: whether a person gets oriented') // shown with the methods, before Go
  expect(text).not.toContain('⚠')
  await b.unmount()
})

test('a panel with no done-when line, or one with no reader or no test, is flagged; no line is read as a sixth expert', async ($, on) => {
  bottom(on)
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  const five = PANEL.split('\n').slice(0, 5).join('\n')
  await reply($, `\`\`\`panel\n${five}\n\`\`\``)
  let b = await mount($)
  let text = fold((await b.find({ key: 'pe-ready' }))?.text)
  expect(text).toContain('⚠ no "Done when, <reader>:" line: name each reader of the result and the test that settles it')
  expect(Boolean(await b.find({ key: 'pe-done-0' }))).toBe(false)
  await b.unmount()
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  await reply($, `\`\`\`panel\n${five}\nDone when: it reads well\nDone when, team lead: none\n\`\`\``, 2)
  b = await mount($)
  text = fold((await b.find({ key: 'pe-ready' }))?.text)
  expect(text).toContain('⚠ a done-when line names no reader: "it reads well"')
  expect(text).toContain('⚠ Done when, team lead: no test')
  expect(text).not.toContain('experts, not five')
  await b.unmount()
})

// ── 0.9.2: the result is held to your own words (2026-10-21 replay and hostile review) ─────────

// his request in the run that drifted, as the reviewer's probe sent it
const DRIFT_REQUEST =
  'how can a first joiner who know nothing about the domain knowledge and tech stack onboard to this codebase with AI help? give me a runbook'
// the reviewer's panel, word for word: every 0.9.1 check passed it, and it repeats the drift
const DRIFT_PANEL = [
  'Developer-experience engineer: maps the repo and writes a first-day path through it; methods: dependency graph from package files, entry-point trace, task analysis',
  'Technical writer: turns the path into numbered steps with copy-paste commands; methods: plain-language review, readability score',
  'AI-pairing specialist: writes the prompts a newcomer pastes into Claude at each step; methods: prompt templates, cold-start run with a fresh subagent',
  'Usability tester (critic): has a fresh subagent with no context follow the runbook and logs each stall; methods: cold-start task success rate, stall-point log',
  'Security reviewer (critic): checks every step for leaked secrets and unsafe defaults; methods: secret scan, least-privilege review',
  'Done when, first joiner: they run the app and fix a starter bug from the runbook alone; test: a fresh subagent follows it cold',
  'Done when, agent: a fresh agent fixes the same bug from the runbook alone; test: cold-start run',
].join('\n')

test("the panel that drifted is flagged: the first joiner is tested by an agent and never held to the request's words", async ($, on) => {
  bottom(on)
  await $.prompt.submit({ text: `++panel ${DRIFT_REQUEST}`, origin: { kind: 'composer' }, wait: false })
  await reply($, `\`\`\`panel\n${DRIFT_PANEL}\n\`\`\``)
  const b = await mount($)
  const text = fold((await b.find({ key: 'pe-ready' }))?.text)
  expect(text).toContain(
    '⚠ Done when, first joiner: say who runs the test ("run by …")',
  )
  expect(text).toContain('⚠ Done when, first joiner: quote the words of the request this reader needs')
  await b.unmount()
  // the same panel with his words quoted and a person running the test passes those two checks
  await $.prompt.submit({ text: `++panel ${DRIFT_REQUEST}`, origin: { kind: 'composer' }, wait: false })
  const held = DRIFT_PANEL.replace(
    'Done when, first joiner: they run the app and fix a starter bug from the runbook alone; test: a fresh subagent follows it cold',
    'Done when, first joiner ("know nothing about the domain knowledge and tech stack"): they explain what the code is for, its domain and its stack, then fix a starter bug; test: they read it cold and explain it back, run by you',
  )
  await reply($, `\`\`\`panel\n${held}\n\`\`\``, 2)
  const c = await mount($)
  const after = fold((await c.find({ key: 'pe-ready' }))?.text)
  expect(after).not.toContain('Done when, first joiner:')
  expect(after).toContain('✓ Done when · first joiner “know nothing about the domain knowledge and tech stack” they explain what the code is for')
  await c.unmount()
})

test('a typed go-ahead starts the trace check too; a typed question does not', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  await reply($, ANSWER)
  await $.prompt.submit({ text: 'go ahead', origin: { kind: 'composer' }, wait: false })
  await reply($, 'Done, no trace here.', 2)
  expect(r.toasts.at(-1)).toContain('No request trace yet')
  const before = r.toasts.length
  // a new ++panel ends the trace check of the work before it
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  await reply($, ANSWER, 3)
  await $.prompt.submit({ text: 'why a security reviewer?', origin: { kind: 'composer' }, wait: false })
  await reply($, 'Because the guide holds commands.', 4)
  expect(r.toasts.length).toBe(before)
  // it starts like a go-ahead but asks something: not the start of the work
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  await reply($, ANSWER, 5)
  await $.prompt.submit({ text: 'ok, but why a security reviewer?', origin: { kind: 'composer' }, wait: false })
  await reply($, 'Because the guide holds commands.', 6)
  expect(r.toasts.length).toBe(before)
})

test('done-when lines are read in the forms models write them; a critic or a sentence is not one', async ($, on) => {
  bottom(on)
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  const five = PANEL.split('\n').slice(0, 5).join('\n')
  const lines = [
    '- [ ] Done when, new hire ("write the onboarding guide"): they set up the machine from the onboarding guide; test: they follow it cold, run by you',
    '*Done when*, team lead ("the onboarding guide"): they approve the onboarding guide;',
    '  test: they read it, run by them',
    '✓ Done when (agent): a fresh agent sets up the machine; test: cold-start run, run by me',
    'Done when, later maintainer (implied): they spot stale steps; test: a dated review, run by them',
  ]
  await reply($, `\`\`\`panel\n${five}\n${lines.join('\n')}\n\`\`\``)
  const b = await mount($)
  const text = fold((await b.find({ key: 'pe-ready' }))?.text)
  expect(text).toContain('✓ Done when · new hire “write the onboarding guide” they set up the machine from the onboarding guide')
  expect(text).toContain('✓ Done when · team lead “the onboarding guide” they approve the onboarding guide; test: they read it, run by them') // the wrapped line joins its test
  expect(text).toContain('✓ Done when · agent a fresh agent sets up the machine')
  expect(text).toContain('✓ Done when · later maintainer (implied) they spot stale steps') // no quote needed, marked instead
  expect(text).not.toContain('⚠')
  await b.unmount()
  // a critic whose field starts with "Done-when" is an expert; a sentence that only starts with "Done when" is not a done line
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  const odd = PANEL.replace(/^5\. Security reviewer.*$/m, '5. Done-when auditor (critic): checks each done-when line; methods: checklist audit, sample re-run')
  await reply($, `\`\`\`panel\n${odd}\nDone when the new hire runs the app: test: they do\n\`\`\``, 2)
  const c = await mount($)
  const t2 = fold((await c.find({ key: 'pe-ready' }))?.text)
  expect(t2).toContain('🔎 Done-when auditor · critic methods: checklist audit, sample re-run')
  expect(t2).toContain('⚠ 6 experts, not five')
  await c.unmount()
})

test('a nearest-step clause is split from the methods: generic methods still show, and the clause gets its own row', async ($, on) => {
  bottom(on)
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  const generic = PANEL.replace(
    /^4\. Usability tester.*$/m,
    '4. Usability tester (critic): watches people follow it; methods: testing; nearest step: a fresh subagent; cannot measure: where people stall',
  )
  await reply($, `\`\`\`panel\n${generic}\n\`\`\``)
  const b = await mount($)
  const text = fold((await b.find({ key: 'pe-ready' }))?.text)
  expect(text).toContain('⚠ Usability tester: only generic methods ("testing")')
  expect(text).toContain('↳ nearest step: a fresh subagent · cannot measure: where people stall')
  await b.unmount()
})

test('✎ Correct keeps your request: the revised panel is still held to your words', async ($, on) => {
  bottom(on)
  await $.prompt.submit({ text: '++p write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  await reply($, ANSWER)
  const b = await mount($)
  await b.press({ key: 'pe-correct' })
  await b.unmount()
  await $.prompt.submit({ text: 'Correction to the panel: swap the support lead for a new hire', origin: { kind: 'composer' }, wait: false })
  const unquoted = PANEL.replace(' ("write the onboarding guide")', '')
  await reply($, `\`\`\`panel\n${unquoted}\n\`\`\``, 2)
  const c = await mount($)
  expect(fold((await c.find({ key: 'pe-ready' }))?.text)).toContain('⚠ Done when, new hire: quote the words of the request this reader needs')
  await c.unmount()
})

test('the 2026-10-25 re-run fix: the panel instruction caps the done-when lines and keeps them to one deliverable', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: '++panel write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  const ctx = r.seen.at(-1)!.context.join('\n')
  expect(ctx).toContain('At most 6 done-when lines: when two readers need the same thing (me asking and me reading), merge them into one line that quotes both')
  expect(ctx).toContain('a reader whose test needs a second deliverable is out of scope')
})

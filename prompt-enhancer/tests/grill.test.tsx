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
const fold = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
// On Windows the engine hands fs hooks backslash paths: key the fake folders by forward slashes.
// Elsewhere a drive-letter stand-in is not absolute, so the engine resolves it against the working
// folder (/…/prompt-enhancer/C:/work/vault/…): drop that prefix to reach the same key.
const posix = (p: string) => p.replace(/\\/g, '/').replace(/^\/.*?\/(?=[A-Za-z]:\/)/, '')

// A ++deep reply in the shape its instruction asks for.
const LENS =
  'pro: reproduce the failure before touching code, then bisect to the breaking change\nraw: logs/auth.log (the raw SSO requests), not the summary in the ticket\nmethods: pytest -k sso, git bisect, the browser network tab\nproof: the SSO end-to-end test passes on a clean clone'
const REWRITE =
  'Fix the SSO login bug. Start from the raw request log in logs/auth.log, not the ticket summary. Reproduce the failure with pytest -k sso first, then use git bisect to find the change that broke it. Done when the SSO end-to-end test passes on a clean clone.'
const ANSWER = `Here is how a professional would go at it.\n\`\`\`deep\n${LENS}\n\`\`\`\n\`\`\`prompt\n${REWRITE}\n\`\`\``

/** The engine beneath the mod: a prompt box, toasts, what reached Claude, and a skills folder in memory. */
function bottom(on: Parameters<TestBody>[1], files = new Map<string, string>()) {
  const r = { box: '', toasts: [] as string[], seen: [] as { text: string; context: readonly string[] }[] }
  on('prompt.submit', (_$, e) => {
    r.seen.push({ text: e.text, context: e.context ?? [] })
    return { text: e.text }
  })
  on('prompt.fill', (_$, e) => {
    r.box = e.text
    return { ...e, isFilled: true }
  })
  on('prompt.read', () => ({ value: { text: r.box, cursor: r.box.length } }))
  on('ui.toast', (_$, e) => {
    r.toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('command.run', () => ({ text: '' }))
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
const mount = ($: Parameters<TestBody>[0], surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'prompt-enhancer', surface, component: 'AbovePrompt', props: BAND })
const cardText = async (b: Awaited<ReturnType<typeof mount>>) => fold((await b.find({ key: 'pe-ready' }))?.text)
const has = async (b: Awaited<ReturnType<typeof mount>>, key: string) => Boolean(await b.find({ key }))


// ── grill mode (0.10.0): "!" after the mode, an interview with no cap on rounds or length ──────────────

const BRIEF = 'Restated.\n```brief\ngoal: x\nscope: y\nconstraints: none\ndone: z\n```'
const LEDGER = '```ledger\nsettled: family: 2 adults, children 8 and 11 (from me)\nassumed: budget: moderate\n```'
const ASK = '```ledger\nsettled: who: 2 adults (from me)\nopen: budget: changes the dishes\n```\nOne more question.'

test('"!" after the mode turns on grill mode; without it, the plain instruction is sent', async ($, on) => {
  const r = bottom(on)
  const cases: [string, string, string][] = [
    ['++! fix the login bug', 'fix the login bug', 'Before doing any work on my request above'],
    ['++g! make the tests pass', 'make the tests pass', 'into a /goal condition'],
    ['++goal! make the tests pass', 'make the tests pass', 'into a /goal condition'],
    ['++l! watch the queue', 'watch the queue', 'into a /loop command'],
    ['++loop! watch the queue', 'watch the queue', 'into a /loop command'],
    ['++d! plan dinners', 'plan dinners', 'a deeper version of my request'],
    ['++deep! plan dinners', 'plan dinners', 'a deeper version of my request'],
    ['++p! write the guide', 'write the guide', 'pick the five experts'],
    ['++panel! write the guide', 'write the guide', 'pick the five experts'],
  ]
  for (const [typed, text, mode] of cases) {
    await $.prompt.submit({ text: typed, origin: { kind: 'composer' }, wait: false })
    const ctx = r.seen.at(-1)!.context.join('\n')
    expect([typed, r.seen.at(-1)!.text]).toEqual([typed, text])
    expect([typed, ctx.includes(mode), ctx.includes('Grill mode: interview me until you hold every fact')]).toEqual([typed, true, true])
  }
  // no "!", or a "!" that does not touch the mode, is the plain mode
  for (const typed of ['++d plan dinners', '++ !important fix', '++deep!ish plan']) {
    await $.prompt.submit({ text: typed, origin: { kind: 'composer' }, wait: false })
    expect([typed, r.seen.at(-1)!.context.join('\n').includes('Grill mode')]).toEqual([typed, false])
  }
})

test('grill instructions carry none of the caps on questions, rounds or length; /goal keeps its own 4,000 limit', async ($, on) => {
  const r = bottom(on)
  const caps = [
    'At most 3 rounds',
    'at most 3 questions',
    'at most 4 questions, multiple choice',
    'under 120 words',
    'under 600 characters',
    'Under 150 words',
    'under 200 characters',
    'At most 6 done-when lines',
    'at most 4 questions per round',
  ]
  for (const typed of ['++! a', '++g! a', '++l! a', '++d! a', '++p! a']) {
    await $.prompt.submit({ text: typed, origin: { kind: 'composer' }, wait: false })
    const ctx = r.seen.at(-1)!.context.join('\n')
    for (const cap of caps) expect([typed, cap, ctx.includes(cap)]).toEqual([typed, cap, false])
    expect([typed, ctx.includes('No length limit: write as much as the result needs, and no more. One deliverable')]).toEqual([typed, true])
    expect([typed, ctx.includes('fenced code block tagged ledger')]).toEqual([typed, true])
  }
  await $.prompt.submit({ text: '++g! a', origin: { kind: 'composer' }, wait: false })
  expect(r.seen.at(-1)!.context.join('\n')).toContain('Then write ONE condition, under 4,000 characters (the most /goal accepts).')
  await $.prompt.submit({ text: '++p! a', origin: { kind: 'composer' }, wait: false })
  expect(r.seen.at(-1)!.context.join('\n')).toContain("the deliverable's form and where it is saved")
})

test('a grill interview is never timed out: a plain draft is dropped after 6 turns, a grill one still lands after 10', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: '++ fix the login bug', origin: { kind: 'composer' }, wait: false })
  for (let i = 1; i <= 6; i++) await reply($, 'Still asking.', i)
  await reply($, BRIEF, 7)
  let b = await mount($)
  expect(await has(b, 'pe-ready')).toBe(false)
  await b.unmount()

  await $.prompt.submit({ text: '++! fix the login bug', origin: { kind: 'composer' }, wait: false })
  for (let i = 1; i <= 10; i++) await reply($, ASK, 10 + i)
  expect(r.toasts.at(-1)).toBe('Grill: 1 settled, 1 open')
  await reply($, `${BRIEF}\n${LEDGER}`, 30)
  b = await mount($)
  const text = await cardText(b)
  expect(text).toContain('BRIEF')
  expect(text).toContain('🧾 Ledger 1 settled · 1 assumed')
  expect(text).not.toContain('still open')
  await b.unmount()
})

test('the grill card flags a ledger line still open, and a draft with no ledger', async ($, on) => {
  bottom(on)
  await $.prompt.submit({ text: '++! fix the login bug', origin: { kind: 'composer' }, wait: false })
  await reply($, `${BRIEF}\n\`\`\`ledger\nsettled: a: b\nopen: c: d\nopen: e: f\n\`\`\``)
  let b = await mount($)
  let text = await cardText(b)
  expect(text).toContain('⚠ 2 ledger facts are still open: the draft guessed them')
  expect(text).toContain('🧾 Ledger 1 settled · 2 open')
  await b.unmount()
  await $.prompt.submit({ text: '++! fix the login bug', origin: { kind: 'composer' }, wait: false })
  await reply($, BRIEF, 2)
  b = await mount($)
  text = await cardText(b)
  expect(text).toContain('⚠ no ledger: grill mode drafts from one, so nothing shows what was settled')
  await b.unmount()
  // a plain draft has no ledger row and no ledger warning
  await $.prompt.submit({ text: '++ fix the login bug', origin: { kind: 'composer' }, wait: false })
  await reply($, BRIEF, 3)
  b = await mount($)
  text = await cardText(b)
  expect(text).not.toContain('Ledger')
  expect(text).not.toContain('no ledger')
  await b.unmount()
})

test('a grill rewrite past 200 words is not called bigger; the same rewrite without "!" still is', async ($, on) => {
  bottom(on)
  const long = `${REWRITE} ${'Two adults and two children aged 8 and 11, no pork on Fridays, 45 minutes on weeknights. '.repeat(14)}`
  const answer = `Deeper.\n\`\`\`deep\n${LENS}\n\`\`\`\n\`\`\`prompt\n${long}\n\`\`\`\n${LEDGER}`
  await $.prompt.submit({ text: '++d! plan a week of healthy dinners', origin: { kind: 'composer' }, wait: false })
  await reply($, answer)
  let b = await mount($)
  expect(await cardText(b)).not.toMatch(/bigger, not deeper/)
  await b.unmount()
  await $.prompt.submit({ text: '++d plan a week of healthy dinners', origin: { kind: 'composer' }, wait: false })
  await reply($, answer, 2)
  b = await mount($)
  expect(await cardText(b)).toMatch(/bigger, not deeper/)
  await b.unmount()
})

test('a grill panel ends with its ledger: the ledger is not read as text outside the panel', async ($, on) => {
  bottom(on)
  const panel = [
    'Technical writer: turns each task into numbered steps; methods: task analysis, plain-language review',
    'Software researcher: checks the claims against studies; methods: literature review, claims table',
    'Maintenance engineer: lays out the bug-fix loop; methods: characterization tests, git bisect',
    'Usability tester (critic): has a newcomer follow it cold; methods: think-aloud test; nearest step: a fresh subagent follows it; cannot measure: where a person gets lost',
    'Fact-checker (critic): checks every claim against its source; methods: claim-to-source trace, planted-claim test',
    'Done when, agent: a fresh agent finishes the first task from the guide alone; test: cold-start run, run by Claude; cannot measure: whether a person understands it',
  ].join('\n')
  const ledger = `\`\`\`ledger\n${Array.from({ length: 12 }, (_, i) => `settled: fact ${i}: a value that takes some room to write down (from me)`).join('\n')}\n\`\`\``
  await $.prompt.submit({ text: '++p! write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  await reply($, `\`\`\`panel\n${panel}\n\`\`\`\n${ledger}`)
  const b = await mount($)
  const text = await cardText(b)
  expect(text).toContain('PANEL')
  expect(text).toContain('🧾 Ledger 12 settled')
  expect(text).not.toMatch(/outside the (panel )?block/)
  await b.unmount()
})

test('0.10.1: a grill panel interviews before the panel, and grill never mines private notes for personal facts', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: '++p! write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  const panel = r.seen.at(-1)!.context.join('\n')
  // the first eval's three grill panels obeyed this line and asked nothing: it must not survive in grill mode
  expect(panel).not.toContain('The panel reply itself asks nothing: the card shows only the panel.')
  expect(panel).toContain('Ask in the replies before the panel: the reply that holds the panel asks nothing, and it comes only when no ledger line is open.')
  for (const typed of ['++! a', '++g! a', '++l! a', '++d! a', '++p! a']) {
    await $.prompt.submit({ text: typed, origin: { kind: 'composer' }, wait: false })
    expect([typed, r.seen.at(-1)!.context.join('\n').includes('Do not search my private notes (daily notes, journal, personal areas) for facts about me, my family, health, money or relationships: ask me instead.')]).toEqual([typed, true])
  }
  // the plain panel keeps its own line
  await $.prompt.submit({ text: '++p write the onboarding guide', origin: { kind: 'composer' }, wait: false })
  expect(r.seen.at(-1)!.context.join('\n')).toContain('The panel reply itself asks nothing: the card shows only the panel.')
})

test('0.11.3: every mode, plain and grill, carries the private-notes rule exactly once', async ($, on) => {
  const r = bottom(on)
  const RULE = 'Do not search my private notes (daily notes, journal, personal areas) for facts about me, my family, health, money or relationships: ask me instead.'
  const count = (s: string) => s.split(RULE).length - 1
  for (const typed of ['++ a', '++g a', '++l a', '++d a', '++p a', '++! a', '++g! a', '++l! a', '++d! a', '++p! a']) {
    await $.prompt.submit({ text: typed, origin: { kind: 'composer' }, wait: false })
    expect([typed, count(r.seen.at(-1)!.context.join('\n'))]).toEqual([typed, 1])
  }
  // the long and slash forms reach the same instructions
  for (const typed of ['++deep a', '++panel a', '++goal a', '++loop a']) {
    await $.prompt.submit({ text: typed, origin: { kind: 'composer' }, wait: false })
    expect([typed, count(r.seen.at(-1)!.context.join('\n'))]).toEqual([typed, 1])
  }
})

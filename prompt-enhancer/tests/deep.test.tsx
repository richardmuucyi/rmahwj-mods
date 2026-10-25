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

for (const surface of ['terminal', 'desktop'] as const) {
  test(`++deep: the instruction asks the four questions; the reply becomes a card and the rewrite goes in the box (${surface})`, async ($, on) => {
    const r = bottom(on)
    await $.prompt.submit({ text: '++deep fix the login bug', origin: { kind: 'composer' }, wait: false })
    expect(r.seen[0]!.text).toBe('fix the login bug')
    const instruction = r.seen[0]!.context.join('\n')
    expect(instruction).toContain('I want a deeper version of my request above, not a bigger one. Do not start the work.')
    expect(instruction).toContain('what a top professional in this field would do here that I am not asking for')
    expect(instruction).toContain('the rawest material they would start from instead of what has already been digested for me, and where it is')
    expect(instruction).toContain('the specific methods and tools they would use, by name')
    expect(instruction).toContain('what, other than you or me, would show the result is right')
    expect(instruction).toContain('Then rewrite my prompt to ask for exactly that.')
    expect(instruction).toContain('add no new deliverables')
    // the cap grew a second figure on 2026-10-25, for a rewrite that carries the answers to Claude's questions
    expect(instruction).toContain('Under 150 words, or 200 when you asked me questions first: the extra is only for my answers.')
    expect(instruction).toContain('fenced code block tagged deep')
    expect(instruction).toContain('fenced code block tagged prompt')

    await reply($, ANSWER)
    expect(r.box).toBe(REWRITE)
    expect(r.toasts).toEqual(['Deeper prompt ready in the prompt box: check it, then Enter'])
    const b = await mount($, surface)
    const text = await cardText(b)
    expect(text).toContain('DEEPER')
    expect(text).toContain('your 4 words → 47 words')
    expect(text).toContain('Pro would reproduce the failure before touching code')
    expect(text).toContain('Start from logs/auth.log (the raw SSO requests)')
    expect(text).toContain('Methods pytest -k sso, git bisect')
    expect(text).toContain('Proof the SSO end-to-end test passes on a clean clone')
    // the rewrite sits under its own label line, in full
    expect(text).toContain('✍ Rewrite')
    expect(text).toContain(fold(REWRITE))
    expect(text).toContain('deeper, not bigger · nothing starts until you send it')
    expect(text).not.toContain('⚠')
    for (const key of ['pe-send', 'pe-edit', 'pe-asgoal', 'pe-dismiss']) expect(await has(b, key)).toBe(true)

    // ▶ Send: the rewrite goes to Claude as your prompt, and the box it sat in is cleared
    await b.press({ key: 'pe-send' })
    expect(r.seen.at(-1)).toEqual({ text: REWRITE, context: [] })
    expect(r.box).toBe('')
    expect(await has(b, 'pe-ready')).toBe(false)
    await b.unmount()
  })
}

test('++d is short for ++deep; "++ deep dive", "++deeper" and "++do" stay briefs', async ($, on) => {
  const r = bottom(on)
  const kindOf = (context: readonly string[]) => {
    const c = context.join('\n')
    return c.includes('deeper version of my request') ? 'deep' : c.includes('Before doing any work') ? 'brief' : 'other'
  }
  for (const [typed, kind, text] of [
    ['++d fix the login bug', 'deep', 'fix the login bug'],
    ['++D fix the login bug', 'deep', 'fix the login bug'],
    ['++deep fix the login bug', 'deep', 'fix the login bug'],
    ['++DEEP: fix the login bug', 'deep', 'fix the login bug'],
    ['++ deep dive into the logs', 'brief', 'deep dive into the logs'],
    ['++deeper look at the logs', 'brief', 'deeper look at the logs'],
    ['++do the release notes', 'brief', 'do the release notes'],
    ['++ d is a letter', 'brief', 'd is a letter'],
  ] as const) {
    await $.prompt.submit({ text: typed, origin: { kind: 'composer' }, wait: false })
    const last = r.seen.at(-1)!
    expect([typed, kindOf(last.context), last.text]).toEqual([typed, kind, text])
  }
  // nothing after it: sent as typed
  await $.prompt.submit({ text: '++d', origin: { kind: 'composer' }, wait: false })
  expect(r.seen.at(-1)).toEqual({ text: '++d', context: [] })
})

test('◎ As goal puts "++g <rewrite>" in the box, and Enter then drafts a /goal from it', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: '++d fix the login bug', origin: { kind: 'composer' }, wait: false })
  await reply($, ANSWER)
  const b = await mount($)
  await b.press({ key: 'pe-asgoal' })
  expect(r.box).toBe(`++g ${REWRITE}`)
  expect(r.toasts.at(-1)).toBe('++g and the rewrite are in the prompt box: press Enter to draft a /goal')
  expect(await has(b, 'pe-ready')).toBe(false)
  await b.unmount()
  await $.prompt.submit({ text: r.box, origin: { kind: 'composer' }, wait: false })
  expect(r.seen.at(-1)!.text).toBe(REWRITE)
  expect(r.seen.at(-1)!.context.join('\n')).toContain('into a /goal condition')
})

test('your own words in the box are never sent over or replaced: ▶ Send, ✎ Edit and ◎ As goal all refuse', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: '++deep fix the login bug', origin: { kind: 'composer' }, wait: false })
  r.box = 'note to self: ask about the flaky test' // typed while Claude answered
  await reply($, ANSWER)
  expect(r.box).toBe('note to self: ask about the flaky test')
  expect(r.toasts).toEqual(['Deeper prompt ready above the prompt; your typing was left in the box'])
  const b = await mount($)
  const sent = r.seen.length
  await b.press({ key: 'pe-send' })
  expect(r.seen.length).toBe(sent) // nothing sent: those words may be your edit of the rewrite
  expect(r.toasts.at(-1)).toBe('Your prompt box has text: send it with Enter, or clear it and press ▶ Send')
  await b.press({ key: 'pe-edit' })
  expect(r.toasts.at(-1)).toBe('Your prompt box has text: clear it, then press ✎ Edit again')
  await b.press({ key: 'pe-asgoal' })
  expect(r.toasts.at(-1)).toBe('Your prompt box has text: clear it, then press ◎ As goal again')
  expect(r.box).toBe('note to self: ask about the flaky test')
  expect(await has(b, 'pe-ready')).toBe(true) // the card stays
  // with the box cleared, ✎ Edit puts the rewrite there
  r.box = ''
  await b.press({ key: 'pe-edit' })
  expect(r.box).toBe(REWRITE)
  await b.unmount()
})

test('sending the rewrite yourself, with Enter, settles the card', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: '++deep fix the login bug', origin: { kind: 'composer' }, wait: false })
  await reply($, ANSWER)
  await $.prompt.submit({ text: r.box, origin: { kind: 'composer' }, wait: false })
  const b = await mount($)
  expect(await has(b, 'pe-ready')).toBe(false)
  await b.unmount()
})

test('the card flags a missing part, a proof that is only us looking, a rewrite that grew, and a user-only skill', async ($, on) => {
  const files = new Map([['C:/work/vault/.claude/skills/tutor/SKILL.md', '---\nname: tutor\ndisable-model-invocation: true\n---\n']])
  const r = bottom(on, files)
  await $.prompt.submit({ text: '++deep teach me the auth flow', origin: { kind: 'composer' }, wait: false })
  expect(r.seen.at(-1)!.context.join('\n')).toContain(
    'User-only skills here (Claude cannot call them): /tutor. If a method needs one, the rewrite says I type it myself',
  )
  const long = `${REWRITE} ${'Then walk every module in src/legacy one by one. '.repeat(12)}Start with /tutor.`
  await reply($, `Deeper.\n\`\`\`deep\npro: x\nraw: y\nmethods: z\nproof: you review it and confirm it reads well\n\`\`\`\n\`\`\`prompt\n${long}\n\`\`\``)
  let b = await mount($)
  let text = await cardText(b)
  expect(text).toContain('⚠ the proof is only you or me looking: name an outside check')
  expect(text).toMatch(/⚠ the rewrite is \d+ words: bigger, not deeper\?/)
  expect(text).toContain('⚠ /tutor is user-only: Claude cannot call it, so you type it')
  await b.unmount()

  // no proof line and no rewrite: both flagged, and there is nothing to send, edit or turn into a goal
  r.box = ''
  await $.prompt.submit({ text: '++deep fix the login bug', origin: { kind: 'composer' }, wait: false })
  await reply($, 'Half an answer.\n```deep\npro: x\nraw: y\nmethods: z\n```', 2)
  expect(r.box).toBe('')
  b = await mount($)
  text = await cardText(b)
  expect(text).toContain('⚠ no outside check named')
  expect(text).toContain('⚠ no rewritten prompt: nothing to send')
  for (const key of ['pe-send', 'pe-edit', 'pe-asgoal']) expect(await has(b, key)).toBe(false)
  expect(await has(b, 'pe-dismiss')).toBe(true)
  await b.unmount()
})

test('a ++deep reply is read as deep even with a goal block in it; other requests never read a prompt block', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: '++deep fix the login bug', origin: { kind: 'composer' }, wait: false })
  await reply($, `${ANSWER}\nIf you want it to keep going:\n\`\`\`goal\nDone when either: (A) x; or (B) y\n\`\`\``)
  let b = await mount($)
  expect(await cardText(b)).toContain('DEEPER')
  await b.unmount()

  r.box = ''
  await $.prompt.submit({ text: '++goal make the tests pass', origin: { kind: 'composer' }, wait: false })
  await reply($, `Not a goal yet.\n\`\`\`prompt\n${REWRITE}\n\`\`\``, 2)
  expect(r.box).toBe('')
  b = await mount($)
  expect(await has(b, 'pe-ready')).toBe(false)
  await b.unmount()
})

test('a word or letter counts only before a space, a colon or the end: "-", "," and "\'" leave a brief', async ($, on) => {
  const r = bottom(on)
  const kindOf = (context: readonly string[]) => {
    const c = context.join('\n')
    return c.includes('deeper version of my request')
      ? 'deep'
      : c.includes('pick the five experts')
        ? 'panel'
        : c.includes('into a /goal condition')
          ? 'goal'
          : c.includes('Before doing any work')
            ? 'brief'
            : 'other'
  }
  for (const [typed, kind, text] of [
    ['++deep-dive into the auth logs', 'brief', 'deep-dive into the auth logs'],
    ['++panel-style layout for the page', 'brief', 'panel-style layout for the page'],
    ["++panel's verdict on the draft", 'brief', "panel's verdict on the draft"],
    ['++deep, then fix it', 'brief', 'deep, then fix it'],
    ['++goal-setting tips for Q4', 'brief', 'goal-setting tips for Q4'],
    ['++d: fix the login bug', 'deep', 'fix the login bug'],
    ['++p: write the onboarding guide', 'panel', 'write the onboarding guide'],
    ['++g: make the tests pass', 'goal', 'make the tests pass'],
    ['++deep: fix the login bug', 'deep', 'fix the login bug'],
  ] as const) {
    await $.prompt.submit({ text: typed, origin: { kind: 'composer' }, wait: false })
    const last = r.seen.at(-1)!
    expect([typed, kindOf(last.context), last.text]).toEqual([typed, kind, text])
  }
})

test('the instruction carries the live-trial fixes: one deliverable, checked paths, short answers', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: '++deep fix the login bug', origin: { kind: 'composer' }, wait: false })
  const instruction = r.seen.at(-1)!.context.join('\n')
  expect(instruction).toContain('one line each, under 200 characters')
  expect(instruction).toContain('Read a file before you say what it holds. Name only a path, command or commit you have checked exists')
  expect(instruction).toContain('"(unchecked)"')
  expect(instruction).toContain('Every step serves my one deliverable')
  expect(instruction).toContain('a second result is a new deliverable even as a last step')
  expect(instruction).toContain('Anything you marked "(unchecked)" goes into the rewrite as a check-first step with a fallback')
})

test('real-world deep replies: list markers, CRLF, a fence inside the rewrite, a quoted prompt before the answers', async ($, on) => {
  const r = bottom(on)
  const ask = async (answer: string, n: number) => {
    r.box = ''
    await $.prompt.submit({ text: '++deep fix the login bug', origin: { kind: 'composer' }, wait: false })
    await reply($, answer, n)
    return cardText(await mount($))
  }
  // answers written as a list fill all four rows
  let text = await ask(`\`\`\`deep\n${LENS.split('\n').map(l => `- ${l}`).join('\n')}\n\`\`\`\n\`\`\`prompt\n${REWRITE}\n\`\`\``, 1)
  expect(text).toContain('Pro would reproduce the failure')
  expect(text).toContain('Proof the SSO end-to-end test passes')
  expect(text).not.toContain('⚠')
  // Windows line endings keep all four
  text = await ask(ANSWER.replace(/\n/g, '\r\n'), 2)
  for (const row of ['Pro would', 'Start from', 'Methods', 'Proof']) expect(text).toContain(row)
  expect(text).not.toContain('⚠')
  // a ````prompt block may hold a ``` example: the box gets the whole rewrite
  const fenced = 'Fix the SSO login bug. Reproduce it first:\n```\npytest -k sso\n```\nThen bisect to the breaking change.'
  await ask(`\`\`\`deep\n${LENS}\n\`\`\`\n\`\`\`\`prompt\n${fenced}\n\`\`\`\``, 3)
  expect(r.box).toBe(fenced)
  // "your prompt" quoted before the answers is not the rewrite
  await ask(`Your prompt was:\n\`\`\`prompt\nfix the login bug\n\`\`\`\n${ANSWER}`, 4)
  expect(r.box).toBe(REWRITE)
})

test('the card shows a long rewrite whole, and a 190-character answer uncut', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: '++deep fix the login bug', origin: { kind: 'composer' }, wait: false })
  const long = `${REWRITE} ${'Then compare the failing and passing request logs line by line and note each header that differs. '.repeat(5)}`.trim()
  const raw = 'logs/auth.log (the raw SSO requests, one per line, with headers), the IdP metadata XML in config/idp.xml, and the failing session cookie from the browser network tab'
  await reply($, `\`\`\`deep\n${LENS.replace(/raw: .*/, `raw: ${raw}`)}\n\`\`\`\n\`\`\`prompt\n${long}\n\`\`\``)
  expect(long.length).toBeGreaterThan(600)
  expect(raw.length).toBeGreaterThan(160)
  const text = await cardText(await mount($))
  expect(text).toContain(fold(long))
  expect(text).toContain(`Start from ${raw}`)
  expect(r.box).toBe(long)
})

test('the 2026-10-24 eval fixes: ask for the facts only I know now, add no new kind of output, and the card flags one', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: '++d plan a week of healthy dinners for a family of four', origin: { kind: 'composer' }, wait: false })
  const instruction = r.seen.at(-1)!.context.join('\n')
  expect(instruction).toContain('or when my request leaves out facts only I know that would change the result: who it is for, where, and the limits of time, money or taste')
  expect(instruction).toContain('never move them into the rewrite as a step for later')
  expect(instruction).toContain('Add no new kind of output either: a table, score sheet, breakdown or analysis my request does not name is a new deliverable')
  expect(instruction).toContain('its numbers are not added to what I get unless I asked for them')
  const rewrite = 'Plan 7 dinners for two adults and two children on HPB My Healthy Plate. Give a per-serving nutrient breakdown for each. Done when each dinner passes the sodium check.'
  await reply($, `Deeper.\n\`\`\`deep\n${LENS}\n\`\`\`\n\`\`\`prompt\n${rewrite}\n\`\`\``)
  const b = await mount($)
  expect(await cardText(b)).toContain('⚠ the rewrite asks for "breakdown", which your request never named: a new deliverable?')
  await b.unmount()
})

test('the 2026-10-25 re-run fix: a rewrite that comes after questions is not called bigger for carrying the answers', async ($, on) => {
  const r = bottom(on)
  await $.prompt.submit({ text: '++d plan a week of healthy dinners for a family of four', origin: { kind: 'composer' }, wait: false })
  // one turn of questions, then the draft: the rewrite may run past 150 words
  await reply($, 'Three facts first.\n```questions\n1. Who eats?\n```')
  const long = `${REWRITE} ${'Two adults and two children aged 8 and 11, no pork on Fridays. '.repeat(11)}`
  await reply($, `Deeper.\n\`\`\`deep\n${LENS}\n\`\`\`\n\`\`\`prompt\n${long}\n\`\`\``, 2)
  const b = await mount($)
  const text = await cardText(b)
  expect(text).toContain('DEEPER')
  expect(text).not.toMatch(/bigger, not deeper/)
  await b.unmount()
  expect(r.seen.length).toBe(1)
})

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
const posix = (p: string) => p.replace(/\\/g, '/')

const GOAL =
  'Done when either: (A) npm test exits 0 in a run after the last edit, its output quoted in the reply; or (B) after 10 "Stop hook feedback" messages, a reply ends "GOAL CAPPED: <what is left>". Either one alone ends the goal. End each reply with "Goal turn N/10" (N = those messages + 1).'

/** The engine beneath the mod: a prompt box, toasts, commands, and a skills folder in memory. */
function bottom(on: Parameters<TestBody>[1], files: Map<string, string>, opts: { root?: string; home?: string; noBox?: boolean } = {}) {
  const r = { box: '', toasts: [] as string[], ran: [] as string[], context: [] as string[], reads: 0 }
  on('prompt.submit', (_$, e) => {
    r.context = [...(e.context ?? [])]
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
  on('command.run', (_$, e) => {
    r.ran.push(`${e.command} ${e.args}`)
    return { text: '' }
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine-own" />
  })
  on('session.root', () => ({ value: opts.root ?? 'C:\\work\\vault' }))
  on('env.get', (_$, e) => ({ value: e.name === 'USERPROFILE' ? (opts.home ?? 'D:\\home\\dev') : undefined }))
  on('fs.list', (_$, e) => {
    const dir = `${posix(e.path)}/`
    const names = new Set([...files.keys()].filter(k => k.startsWith(dir)).map(k => k.slice(dir.length).split('/')[0]!))
    // `tutor` stands for a junctioned skill folder, which lists as `other`
    return {
      value: [...names].map(name => ({ name, kind: name === 'tutor' ? ('other' as const) : ('dir' as const), size: 0, mtimeMs: 0, isLink: false })),
    }
  })
  on('fs.read', (_$, e) => {
    r.reads++
    const text = files.get(posix(e.path))
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  return r
}

test('a draft never replaces what you typed while Claude drafted, and ✎ Edit will not either', async ($, on) => {
  const r = bottom(on, new Map())
  let turn = 0
  await $.prompt.submit({ text: '++goal make the tests pass', origin: { kind: 'composer' }, wait: false })
  r.box = 'note to self: ask about the flaky test' // typed during the drafting turn
  await $.turn.complete({
    answer: `Drafted.\n\`\`\`goal\n${GOAL}\n\`\`\`\n\`\`\`parts\nend: tests pass\ncheck: npm test exits 0\nkeep: none\nlimit: 10\n\`\`\``,
    durationMs: 1000,
    isAborted: false,
    turnId: `t${++turn}`,
    reason: 'answer',
  })
  expect(r.box).toBe('note to self: ask about the flaky test')
  expect(r.toasts).toEqual(['/goal ready above the prompt; your typing was left in the box'])

  const band = await $.ui.mount({ plugin: 'prompt-enhancer', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await band.press({ key: 'pe-edit' })
  expect(r.box).toBe('note to self: ask about the flaky test')
  expect(r.toasts[1]).toBe('Your prompt box has text: clear it, then press ✎ Edit again')

  // ▶ Start runs the goal and leaves your words in the box
  await band.press({ key: 'pe-start' })
  expect(r.ran).toEqual([`goal ${GOAL}`])
  expect(r.box).toBe('note to self: ask about the flaky test')
  await band.unmount()
})

test('a goal over 4,000 characters is flagged and has no ▶ Start; nothing cuts it', async ($, on) => {
  const r = bottom(on, new Map())
  const long = `${GOAL} ${'and every module in src/legacy is migrated '.repeat(100)}`.trim()
  await $.prompt.submit({ text: '++goal migrate everything', origin: { kind: 'composer' }, wait: false })
  await $.turn.complete({
    answer: `Long.\n\`\`\`goal\n${long}\n\`\`\`\n\`\`\`parts\nend: migrated\ncheck: npm test\nkeep: none\nlimit: 10\n\`\`\``,
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  expect(r.box).toBe(`/goal ${long}`) // in the box whole, for you to shorten
  const band = await $.ui.mount({ plugin: 'prompt-enhancer', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(fold((await band.find({ key: 'pe-ready' }))?.text)).toContain('⚠ over 4,000 characters: /goal will refuse it')
  expect(Boolean(await band.find({ key: 'pe-start' }))).toBe(false)
  expect(Boolean(await band.find({ key: 'pe-edit' }))).toBe(true)
  await band.unmount()
})

test('++loop names the user-only skills in its instruction, and the card flags a loop that calls one', async ($, on) => {
  const files = new Map([
    ['C:/work/vault/.claude/skills/civitai-daily-buzz/SKILL.md', '---\nname: civitai-daily-buzz\ndisable-model-invocation: true\n---\n'],
    ['C:/work/vault/.claude/skills/krea2/SKILL.md', '---\nname: krea2\ndescription: images\n---\n'],
    ['C:/work/vault/.claude/skills/notes/README.md', 'no SKILL.md in this folder'],
    ['D:/home/dev/.claude/skills/tutor/SKILL.md', '---\ndisable-model-invocation: true\n---\n'],
  ])
  const r = bottom(on, files)
  await $.prompt.submit({ text: '++loop collect the buzz every day', origin: { kind: 'composer' }, wait: false })
  const instruction = r.context.join('\n')
  expect(instruction).toContain('User-only skills here (Claude cannot call them, and a loop pass gets them as plain text): /civitai-daily-buzz, /tutor. If a step needs one, do not rebuild its steps')
  expect(instruction).not.toContain('/krea2')
  expect(instruction).toContain('Laptop off, or longer than 7 days, is /schedule, but only when the work needs no local files, browser or GPU')

  await $.turn.complete({
    answer:
      'Daily.\n```loop\n24h run /civitai-daily-buzz; if nothing changed, say so in one line\n```\n```parts\nevery: 24h\ncheck: buzz\nif: report\nstop: never\nnever: none\n```',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  const band = await $.ui.mount({ plugin: 'prompt-enhancer', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const text = fold((await band.find({ key: 'pe-ready' }))?.text)
  expect(text).toContain('⚠ /civitai-daily-buzz is user-only: a loop pass gets it as plain text')
  expect(text).not.toContain('one-line report')
  await band.unmount()
})

const SKILLS = new Map([
  ['C:/work/vault/.claude/skills/tutor/SKILL.md', '---\nname: tutor\ndisable-model-invocation: true\n---\n'],
  ['C:/work/vault/.claude/skills/krea2/SKILL.md', '---\nname: krea2\n---\n'],
])
const reply = ($: Parameters<TestBody>[0], answer: string, n = 1) =>
  $.turn.complete({ answer, durationMs: 1000, isAborted: false, turnId: `t${n}`, reason: 'answer' })
const band = ($: Parameters<TestBody>[0]) =>
  $.ui.mount({ plugin: 'prompt-enhancer', surface: 'terminal', component: 'AbovePrompt', props: BAND })

test('▶ Start does not run the old draft when you edited it in the box: Enter starts your version', async ($, on) => {
  const r = bottom(on, new Map())
  await $.prompt.submit({ text: '++goal make the tests pass', origin: { kind: 'composer' }, wait: false })
  await reply($, `Drafted.\n\`\`\`goal\n${GOAL}\n\`\`\`\n\`\`\`parts\nend: tests pass\ncheck: npm test\nkeep: none\nlimit: 10\n\`\`\``)
  expect(r.box).toBe(`/goal ${GOAL}`)
  r.box = `/goal ${GOAL.replace(/10/g, '20')}` // you changed K from 10 to 20
  const b = await band($)
  await b.press({ key: 'pe-start' })
  expect(r.ran).toEqual([])
  expect(r.box).toBe(`/goal ${GOAL.replace(/10/g, '20')}`)
  expect(r.toasts.at(-1)).toBe('Your edited /goal is in the box: press Enter to start it')
  expect(Boolean(await b.find({ key: 'pe-ready' }))).toBe(true) // the card stays
  // other words in the box are not an edited draft: ▶ Start runs the draft and leaves them alone
  r.box = 'note to self'
  await b.press({ key: 'pe-start' })
  expect(r.ran).toEqual([`goal ${GOAL}`])
  expect(r.box).toBe('note to self')
  await b.unmount()
})

test('++goal also names the user-only skills, and the card flags a goal or a loop that calls one', async ($, on) => {
  const r = bottom(on, new Map(SKILLS))
  await $.prompt.submit({ text: '++goal tutor me until I pass', origin: { kind: 'composer' }, wait: false })
  expect(r.context.join('\n')).toContain('User-only skills here (Claude cannot call them, and a loop pass gets them as plain text): /tutor.')
  await reply($, `Drafted.\n\`\`\`goal\n${GOAL} Start with /tutor.\n\`\`\`\n\`\`\`parts\nend: x\ncheck: y\nkeep: none\nlimit: 10\n\`\`\``)
  let b = await band($)
  expect(fold((await b.find({ key: 'pe-ready' }))?.text)).toContain('⚠ /tutor is user-only: Claude cannot call it')
  await b.unmount()
  // a ++goal answered with a loop is checked against the same list
  await $.prompt.submit({ text: '++goal drill me daily', origin: { kind: 'composer' }, wait: false })
  await reply($, 'A loop fits.\n```loop\n24h run /tutor; if nothing changed, say so in one line\n```\n```parts\nevery: 24h\ncheck: x\nif: y\nstop: z\nnever: none\n```', 2)
  b = await band($)
  expect(fold((await b.find({ key: 'pe-ready' }))?.text)).toContain('⚠ /tutor is user-only: a loop pass gets it as plain text')
  await b.unmount()
})

test('the skills folder is read once when the session runs in the home folder', async ($, on) => {
  const r = bottom(on, new Map(SKILLS), { root: 'C:/work/vault', home: 'C:\\work\\vault\\' })
  await $.prompt.submit({ text: '++loop check the queue', origin: { kind: 'composer' }, wait: false })
  expect(r.context.join('\n')).toContain('/tutor.')
  expect(r.reads).toBe(2) // tutor and krea2, once each
})

test('an empty or unreadable skills folder is not remembered as "no user-only skills"', async ($, on) => {
  const files = new Map<string, string>()
  const r = bottom(on, files)
  await $.prompt.submit({ text: '++loop check the queue', origin: { kind: 'composer' }, wait: false })
  expect(r.context.join('\n')).not.toContain('User-only skills here')
  // with no list, the loop rules still carry the ban on rebuilding a user-only skill
  expect(r.context.join('\n')).toContain('If a step needs one, do not rebuild its steps')
  for (const [k, v] of SKILLS) files.set(k, v)
  await $.prompt.submit({ text: '++loop check it again', origin: { kind: 'composer' }, wait: false })
  expect(r.context.join('\n')).toContain('/tutor.')
})

test('a draft arriving after the skills appeared is still checked: the scan runs again before the card', async ($, on) => {
  const files = new Map<string, string>()
  bottom(on, files)
  await $.prompt.submit({ text: '++goal tutor me', origin: { kind: 'composer' }, wait: false }) // nothing to list yet
  for (const [k, v] of SKILLS) files.set(k, v)
  await reply($, `Drafted.\n\`\`\`goal\n${GOAL} Start with /tutor.\n\`\`\`\n\`\`\`parts\nend: x\ncheck: y\nkeep: none\nlimit: 10\n\`\`\``)
  const b = await band($)
  expect(fold((await b.find({ key: 'pe-ready' }))?.text)).toContain('⚠ /tutor is user-only: Claude cannot call it')
  await b.unmount()
})

test('✎ Correct on a brief leaves your own words in the box; with the box empty it puts the correction start there', async ($, on) => {
  const r = bottom(on, new Map())
  await $.prompt.submit({ text: '++ fix the login bug', origin: { kind: 'composer' }, wait: false })
  await reply($, 'Brief.\n```brief\ngoal: SSO login works\nscope: login page only\nconstraints: none\ndone: SSO login works in the dev build\n```')
  r.box = 'note to self: ask about the flaky test'
  const b = await band($)
  await b.press({ key: 'pe-correct' })
  expect(r.box).toBe('note to self: ask about the flaky test')
  expect(r.toasts.at(-1)).toBe('Your prompt box has text: clear it, then press ✎ Correct again')
  expect(Boolean(await b.find({ key: 'pe-ready' }))).toBe(true) // the card stays
  r.box = ''
  await b.press({ key: 'pe-correct' })
  expect(r.box).toBe('Correction to the brief: ')
  expect(Boolean(await b.find({ key: 'pe-ready' }))).toBe(false)
  await b.unmount()
})

test('✎ Correct on a brief with a prompt box that cannot be read changes nothing and says so; the card stays', async ($, on) => {
  const r = bottom(on, new Map(), { noBox: true })
  await $.prompt.submit({ text: '++ fix the login bug', origin: { kind: 'composer' }, wait: false })
  await reply($, 'Brief.\n```brief\ngoal: SSO login works\nscope: login page only\nconstraints: none\ndone: SSO login works in the dev build\n```')
  r.box = 'my own half-typed note'
  const b = await band($)
  await b.press({ key: 'pe-correct' })
  expect(r.box).toBe('my own half-typed note')
  expect(r.toasts.at(-1)).toBe('Could not read the prompt box: type "Correction to the brief:" and your correction yourself')
  expect(Boolean(await b.find({ key: 'pe-ready' }))).toBe(true)
  await b.unmount()
})

test('a prompt box that cannot be read is left alone, and the toast does not claim it held your typing', async ($, on) => {
  const r = bottom(on, new Map(), { noBox: true })
  await $.prompt.submit({ text: '++goal make the tests pass', origin: { kind: 'composer' }, wait: false })
  await reply($, `Drafted.\n\`\`\`goal\n${GOAL}\n\`\`\`\n\`\`\`parts\nend: x\ncheck: y\nkeep: none\nlimit: 10\n\`\`\``)
  expect(r.box).toBe('')
  expect(r.toasts).toEqual(['/goal ready above the prompt'])
})

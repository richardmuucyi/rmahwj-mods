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

// ── Drift: the 2026-10-21 eval review's probes, kept as tests (each failed on 0.9.2 before its fix) ──────
// His request in the run that drifted, word for word.
const REQUEST =
  'i do not know what is the current trend method that onboarding the new code base, and get AI agent to study the source code and understand it, i saw some content creators will create agent skills as domain knowledge based on the source code, is that the best approoach? what are the best practices to use AI to help development, and also bug fixes for first joiner who know nothing about the domain knowledge and tech stack? how to get AI agent to extract all info and compile into something helpful like runbook? or do you have better visual aids ?'

const FIVE = [
  'Legacy-code engineer: maps the pilot repo: build and run, entry points, one request traced end to end, hot spots; methods: end-to-end request trace, import-graph extraction, git churn analysis',
  'Agent context engineer: compares skills, CLAUDE.md and runbooks from vendor docs, writes the pilot agent files; methods: progressive disclosure, with/without-context A/B on held-out questions',
  'Technical communicator: writes the first-week runbook and bug-fix playbook, draws the diagrams; methods: Diátaxis split, task analysis, C4 diagrams, sequence diagram of one request',
  'Usability tester (critic): has a newcomer fix a planted bug in the pilot repo using only the runbook; methods: think-aloud test, task success rate, time to first fix; nearest step: a fresh subagent with no repo context follows it cold; cannot measure: where a person gets lost',
  'Fact-checker (critic): traces each claim in the answer, skill and runbook to a file:line or primary source; methods: claim-to-source tracing, planted false claims, drift check on a newer commit',
]
const FIVE_NO_SWAP = [
  ...FIVE.slice(0, 3),
  'Usability tester (critic): watches two newcomers fix a planted bug from the runbook alone; methods: think-aloud test, task success rate',
  FIVE[4]!,
]
const AGENT_LINE =
  'Done when, AI agent ("get AI agent to study the source code and understand it"): a fresh agent with the files studies the source code, then answers questions and fixes a planted bug; test: cold-start run, run by Claude'
const OWNER_LINE =
  'Done when, the owner ("is that the best approoach?"): the answer says which approach is best for him and why; test: he reads it and picks one, run by the owner'
// what a held line looks like: his words quoted, the test checks those very words, and a person runs it
const GOOD_JOINER =
  'Done when, first joiner ("first joiner who know nothing about the domain knowledge and tech stack"): from the runbook alone they explain what the code is for, its domain and its tech stack, then fix a starter bug; test: cold read and think-aloud, run by the owner'
const ADV: Record<string, { lines: string[]; must: string[]; mustNot?: string[] }> = {
  // the 0.9.1 drift itself: a subagent tests the joiner, with its limit stated
  A_original_drift_with_limit: {
    lines: [...FIVE, 'Done when, first joiner ("first joiner who know nothing about the domain knowledge and tech stack"): they run the app and fix a starter bug from the runbook alone; test: a fresh subagent follows it cold, run by Claude; cannot measure: where a person gets lost', AGENT_LINE, OWNER_LINE],
    must: [
      'Done when, first joiner: a person\'s need is tested only by an agent: name a person in "run by", and a stated limit does not replace that',
      'Done when, first joiner: the test leaves out the need it quotes: domain, tech, stack',
    ],
  },
  B_machine_word_in_reader: {
    lines: [...FIVE, 'Done when, first joiner using an AI agent ("first joiner who know nothing about the domain knowledge and tech stack"): they fix a starter bug; test: a fresh subagent follows it cold, run by Claude', AGENT_LINE, OWNER_LINE],
    must: ['Done when, first joiner using an AI agent: a person\'s need is tested only by an agent: name a person in "run by", and a stated limit does not replace that'],
  },
  C_quote_from_wrong_part: {
    lines: [...FIVE, 'Done when, first joiner ("what are the best practices to use AI to help development"): they fix a starter bug from the runbook; test: they follow it cold, run by the owner', AGENT_LINE, OWNER_LINE],
    must: ["Done when, first joiner: quote the request's words about the first joiner"],
  },
  D_person_word_in_agent_test: {
    lines: [...FIVE, 'Done when, first joiner ("first joiner who know nothing about the domain knowledge and tech stack"): they explain the domain and the tech stack, then fix a starter bug; test: a fresh subagent follows it cold and a person skims its log, run by Claude', AGENT_LINE, OWNER_LINE],
    must: ['Done when, first joiner: a person\'s need is tested only by an agent: name a person in "run by", and a stated limit does not replace that'],
  },
  E_no_first_joiner_line_at_all: {
    lines: [...FIVE, OWNER_LINE, AGENT_LINE],
    must: ['no done-when line for "first joiner", whom the request names'],
  },
  F_think_aloud_unswapped: {
    lines: [...FIVE_NO_SWAP, GOOD_JOINER, OWNER_LINE, AGENT_LINE],
    must: ['Usability tester: needs people Claude does not have: add "nearest step: …; cannot measure: …" to this line'],
  },
  G_quoted_need_untested: {
    lines: [...FIVE, 'Done when, first joiner ("first joiner who know nothing about the domain knowledge and tech stack"): they set up, run the tests and fix one seeded bug; test: cold follow, run by the owner', AGENT_LINE, OWNER_LINE],
    must: ['Done when, first joiner: the test leaves out the need it quotes: domain, tech, stack'],
  },
  H_no_runner: {
    lines: [...FIVE, 'Done when, first joiner ("first joiner who know nothing about the domain knowledge and tech stack"): they explain the domain and the tech stack back; test: cold read', AGENT_LINE, OWNER_LINE],
    must: ['Done when, first joiner: say who runs the test ("run by …")'],
  },
  // E2 replay (2026-10-22): an agent reader followed by an -ing phrase was read as a person ("build", "guide")
  I_agent_doing_the_build: {
    lines: [...FIVE, GOOD_JOINER, OWNER_LINE, AGENT_LINE.replace('Done when, AI agent', 'Done when, the AI agent doing the build')],
    must: [],
  },
  J_agent_following_the_runbook: {
    lines: [...FIVE, GOOD_JOINER, OWNER_LINE, AGENT_LINE.replace('Done when, AI agent', 'Done when, agent following the runbook')],
    must: [],
  },
  // positive control for I and J: a person followed by an -ing phrase is still a person
  K_joiner_reading_the_runbook: {
    lines: [...FIVE, GOOD_JOINER.replace('Done when, first joiner', 'Done when, first joiner reading the runbook').replace('run by the owner', 'run by Claude'), OWNER_LINE, AGENT_LINE],
    must: ['Done when, first joiner reading the runbook: a person\'s need is tested only by an agent: name a person in "run by", and a stated limit does not replace that'],
  },
  // negative control: the held line passes every check
  Z_held: { lines: [...FIVE, GOOD_JOINER, AGENT_LINE, OWNER_LINE], must: [], mustNot: ['Done when, first joiner', 'whom the request names'] },
}

for (const [name, c] of Object.entries(ADV)) {
  test(`drift probe ${name}`, async ($, on) => {
    bottom(on)
    await $.prompt.submit({ text: `++panel ${REQUEST}`, origin: { kind: 'composer' }, wait: false })
    await reply($, '```panel\n' + c.lines.join('\n') + '\n```')
    const b = await mount($)
    const card = await b.find({ key: 'pe-ready' })
    expect(card).toBeTruthy() // a card that never draws must not pass for "no warnings"
    const text = fold(card?.text)
    for (const w of c.must) expect([name, text]).toEqual([name, expect.stringContaining(`⚠ ${w}`)])
    for (const w of c.mustNot ?? []) expect([name, text.includes(`⚠ ${w}`)]).toEqual([name, false])
    if (c.must.length === 0) expect([name, text.includes('⚠')]).toEqual([name, false])
    await b.unmount()
  })
}

// Persons the request names by a newcomer word, or with a gap ("never used Python", "can't code"), need a line.
test('a person described with a knowledge gap needs a done-when line; a person merely mentioned does not', async ($, on) => {
  bottom(on)
  const req =
    "I'm a product manager joining a team that owns a Kotlin Android app. I can't code. Make me something that explains which screens exist, what each feature does for users, and which parts are risky to change, so I can talk to the engineers."
  await $.prompt.submit({ text: `++panel ${req}`, origin: { kind: 'composer' }, wait: false })
  await reply($, '```panel\n' + FIVE.join('\n') + '\nDone when, agent: a fresh agent maps the screens; test: cold-start run, run by Claude\n```')
  let b = await mount($)
  let text = fold((await b.find({ key: 'pe-ready' }))?.text)
  expect(text).toContain('⚠ no done-when line for "product manager", whom the request names')
  expect(text).not.toContain('"engineers"')
  await b.unmount()
  // the owner speaking of himself may be the reader "you"
  await $.prompt.submit({ text: `++panel ${req}`, origin: { kind: 'composer' }, wait: false })
  const you =
    'Done when, you ("which screens exist, what each feature does for users, and which parts are risky to change"): you can name the screens, what each feature does for users and which parts are risky to change; test: you explain them back to an engineer, run by you'
  await reply($, '```panel\n' + FIVE.join('\n') + '\n' + you + '\n```', 2)
  b = await mount($)
  text = fold((await b.find({ key: 'pe-ready' }))?.text)
  expect(text).not.toContain('whom the request names')
  expect(text).not.toContain('Done when, you:')
  await b.unmount()
})

// ── The trace after Go: two marks per row, every quoted need has a row, armed until a trace arrives ──────
const TRACE_PANEL = [...FIVE, GOOD_JOINER, AGENT_LINE, OWNER_LINE].join('\n')
const goWith = async ($: Parameters<TestBody>[0], n: number) => {
  await $.prompt.submit({ text: `++panel ${REQUEST}`, origin: { kind: 'composer' }, wait: false })
  await reply($, '```panel\n' + TRACE_PANEL + '\n```', n)
  const b = await mount($)
  await b.press({ key: 'pe-go' })
  await b.unmount()
}
const J = '"first joiner who know nothing about the domain knowledge and tech stack"'
const A = '"get AI agent to study the source code and understand it"'
const O = '"is that the best approoach?"'
const TRACES: Record<string, { rows: string[]; toast: string }> = {
  all_present_and_checked: {
    rows: [`${J} | Part 0: "a Python library that reads and writes .ics files" | present | person: yes`, `${A} | AGENTS.md | present | person: n/a`, `${O} | answer §1 | present | person: yes`],
    toast: 'Request trace: 3 of 3 present, every person check done',
  },
  person_need_not_checked_by_a_person: {
    rows: [`${J} | Part 0 | present | person: no`, `${A} | AGENTS.md | present | person: n/a`, `${O} | answer §1 | present | person: yes`],
    toast: '⚠ Request trace: 3 present, 0 partly, 0 absent; 1 need of a person not checked by a person: read those rows before you accept the work',
  },
  person_need_marked_na: {
    rows: [`${J} | Part 0 | present | person: n/a`, `${A} | AGENTS.md | present | person: n/a`, `${O} | answer §1 | present | person: yes`],
    toast: '⚠ Request trace: 3 present, 0 partly, 0 absent; 1 need of a person not checked by a person: read those rows before you accept the work',
  },
  unknown_statuses: {
    rows: [`${J} | nowhere | not met | person: no`, `${A} | AGENTS.md | met | person: n/a`, `${O} | answer §1 | present | person: yes`],
    toast: '⚠ Request trace: 1 present, 0 partly, 0 absent; 1 need of a person not checked by a person; 2 rows without a status the trace may use: read those rows before you accept the work',
  },
  self_chosen_rows: {
    rows: [`${O} | answer §1 | present | person: yes`, '"bug fixes" | §4 | present | person: n/a', '"like runbook" | RUNBOOK.md | present | person: n/a'],
    toast: `⚠ Request trace: 3 present, 0 partly, 0 absent; no row for ${J}, ${A}: read those rows before you accept the work`,
  },
  content_gaps: {
    rows: [`${J} | — | absent | person: no`, `${A} | AGENTS.md | partly | person: n/a`, `${O} | answer §1 | present | person: yes`],
    toast: '⚠ Request trace: 1 present, 1 partly, 1 absent; 1 need of a person not checked by a person: read those rows before you accept the work',
  },
}
for (const [name, t] of Object.entries(TRACES)) {
  test(`trace ${name}`, async ($, on) => {
    const r = bottom(on)
    await goWith($, 1)
    await reply($, 'Done.\n```trace\n' + t.rows.join('\n') + '\n```', 2)
    expect(r.toasts.at(-1)).toBe(t.toast)
  })
}

test('the trace check stays armed until a trace arrives: a question turn, then the final turn, are both checked', async ($, on) => {
  const r = bottom(on)
  await goWith($, 1)
  await reply($, 'Survey done and the pilot repo is cloned. Shall I go on to the runbook?', 2)
  expect(r.toasts.at(-1)).toBe('⚠ No request trace yet: the work is not done until its trace is written (one row per thing you asked for)')
  await $.prompt.submit({ text: 'yes continue', origin: { kind: 'composer' }, wait: false })
  const before = r.toasts.length
  await reply($, 'Runbook written. No trace block.', 3)
  expect(r.toasts.length).toBe(before + 1)
  expect(r.toasts.at(-1)).toContain('No request trace yet')
  await reply($, 'Done.\n```trace\n' + TRACES.all_present_and_checked!.rows.join('\n') + '\n```', 4)
  expect(r.toasts.at(-1)).toBe('Request trace: 3 of 3 present, every person check done')
  const after = r.toasts.length
  await reply($, 'An ordinary answer later on.', 5)
  expect(r.toasts.length).toBe(after) // a trace disarms the check
})

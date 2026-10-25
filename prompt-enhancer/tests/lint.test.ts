import { expect, test } from 'claude-code/testing'

import { DEEP_WORDS, DEEP_WORDS_ASKED, GOAL_LIMIT, PANEL_DONE_MAX, isPersonReader, lintDeep, lintGoal, lintLoop, lintPanel, userOnlyName, wordCount } from '../hooks/lint'

// The cap pattern the ++goal instruction asks for, as a real draft would carry it.
const CAPPED_GOAL =
  'Done when either: (A) npm test -- test/auth exits 0 in a run after the last edit, its output quoted in the reply, and git diff --stat lists only src/auth; or (B) after 15 "Stop hook feedback" messages, a reply ends "GOAL CAPPED: <what is left>". Either one alone ends the goal. End each reply with "Goal turn N/15" (N = those messages + 1).'
// The first wording tried: the judge accepted its cap in only 1 of 3 runs.
const V1_GOAL =
  'python check.py exits 0 in a run after the last edit. End each reply with "Goal turn N/3" (N = Stop hook feedback messages so far + 1). Or done when a reply ends "GOAL CAPPED: <what is left>" after 3 such messages; then make no tool calls.'

const NO_CAP = 'no cap: it runs until met, or until a guard or you stop it'
const NO_COUNT = 'turn cap with no printed count: nothing counts turns, so it never trips'
const CLOCK = 'clock deadline: the judge has no clock, only times printed in the chat'
const QUIET = 'no one-line report for a quiet pass'

// ── /goal: the cap ────────────────────────────────────────────────────────────

test('a condition in the instructed shape passes clean (negative control)', () => {
  expect(lintGoal(CAPPED_GOAL)).toEqual([])
})

test('a goal with no cap at all is flagged; the official examples have none', () => {
  expect(lintGoal('npm test exits 0 in a run after the last edit, output quoted')).toEqual([NO_CAP])
  expect(lintGoal('all tests in test/auth pass and the lint step is clean')).toEqual([NO_CAP])
})

test('a turn cap with no printed count is flagged, in every common wording', () => {
  for (const g of [
    'npm test exits 0, or stop after 15 turns',
    'get the Lighthouse score to 90 or above, stop after 5 tries',
    'his 5 missing files are in place or 40 turns',
    'npm test exits 0, max 15 turns',
    'npm test exits 0, at most 15 turns',
    'npm test exits 0 within a 15-turn limit',
    'npm test exits 0; after 15 turns, stop',
    'npm test exits 0 or 10 goal checks',
    'npm test exits 0; or (B) after 15 "Stop hook feedback" messages, a reply ends "GOAL CAPPED: x"',
  ]) {
    expect(lintGoal(g)).toContain(NO_COUNT)
    expect(lintGoal(g)).not.toContain(NO_CAP)
  }
})

test('a printed count with no GOAL CAPPED line is flagged: a reached cap would read as achieved', () => {
  expect(lintGoal('npm test exits 0. End each reply with "Goal turn N/15", stop after 15 turns')).toEqual([
    'count with no GOAL CAPPED line: a reached cap would read as achieved',
  ])
})

test('a cap that is not a real either/or is flagged, even when the word "either" appears', () => {
  const msg = 'cap not written as "either: (A) … or (B)": the judge may still demand the end state'
  expect(lintGoal(V1_GOAL)).toEqual([msg])
  expect(
    lintGoal(
      'npm test exits 0. Either way, keep src clean. Or after 10 "Stop hook feedback" messages, a reply ends "GOAL CAPPED: x". End each reply with "Goal turn N/10".',
    ),
  ).toContain(msg)
})

test('the placeholder K or <end state> left in is flagged', () => {
  const left = 'placeholder left in (K or <end state>): put the real value in'
  expect(lintGoal(CAPPED_GOAL.replace(/15/g, 'K'))).toContain(left)
  expect(lintGoal(CAPPED_GOAL.replace('npm test -- test/auth exits 0', '<end state>'))).toContain(left)
  // the runtime placeholders stay: <what is left> and N are written as-is (negative control)
  expect(lintGoal(CAPPED_GOAL)).not.toContain(left)
})

test('a count that does not match the cap is flagged', () => {
  expect(lintGoal(CAPPED_GOAL.replace('Goal turn N/15', 'Goal turn N/5'))).toContain(
    'the count goes to 5 but the cap is after 15 messages: make them the same',
  )
})

// ── /goal: words the judge cannot use ─────────────────────────────────────────

test('clock deadlines are flagged; a latency target, a data window and a file name are not', () => {
  for (const g of [
    'By 09:00: the files are copied',
    'tests pass until 5pm',
    'tests pass within 2 hours',
    'run overnight until green',
    'stop after 30 minutes',
    'tests pass in 2h',
    'done by noon',
    'done by end of day',
  ]) {
    expect(lintGoal(g)).toContain(CLOCK)
  }
  for (const g of [
    'p95 ci time <10 mins, read from the timings table after each change',
    'the report lists errors at 3 places in src/',
    'the export covers data for 3 days',
    'tomorrow.json exists and parses',
  ]) {
    expect(lintGoal(g)).not.toContain(CLOCK)
  }
})

test('taste words are flagged with the word quoted', () => {
  expect(lintGoal('the app looks good and is production-ready')).toContain('"looks good" cannot be judged from the chat')
  expect(lintGoal('the module is robust')).toContain('"robust" cannot be judged from the chat')
})

test('a condition over the /goal limit is flagged; exactly the limit is not', () => {
  const over = 'over 4,000 characters: /goal will refuse it'
  expect(lintGoal('x'.repeat(GOAL_LIMIT))).not.toContain(over)
  expect(lintGoal('x'.repeat(GOAL_LIMIT + 1))).toContain(over)
})

test('a goal that calls a user-only skill is flagged: Claude cannot call it', () => {
  expect(lintGoal(`${CAPPED_GOAL} Run /tutor first.`, ['tutor'])).toEqual(['/tutor is user-only: Claude cannot call it'])
})

// ── /loop ─────────────────────────────────────────────────────────────────────

test('a loop with no line for a quiet pass is flagged; the usual wordings count', () => {
  expect(lintLoop('5m check the deploy status and report it')).toEqual([QUIET])
  for (const l of [
    'check CI on PR 12; if nothing changed, say so in one line',
    'check CI; if unchanged, say so',
    'check the queue; nothing to report means one line',
    'check CI. If everything is green and quiet, say so in one line.',
    'check CI; say so in one line when all is green',
    '檢查 CI；沒有變化就用一句話說',
  ]) {
    expect(lintLoop(l)).toEqual([])
  }
  // these mention one line or changes but not the quiet pass (negative controls)
  for (const l of ['make no changes outside docs/, then commit', 'apply a one-line fix to the build', 'when CI changes, report it in one line']) {
    expect(lintLoop(l)).toEqual([QUIET])
  }
})

test('a loop that calls a user-only skill is flagged, quoted or not; a path or a longer name is not', () => {
  const names = ['civitai-daily-buzz', 'add-posts', 'tutor']
  const ok = 'if nothing changed, say so in one line'
  expect(lintLoop(`1h run /civitai-daily-buzz; ${ok}`, names)).toEqual([
    '/civitai-daily-buzz is user-only: a loop pass gets it as plain text',
  ])
  expect(lintLoop(`run "/tutor" then \`/add-posts\`; ${ok}`, names)).toEqual([
    '/add-posts is user-only: a loop pass gets it as plain text',
    '/tutor is user-only: a loop pass gets it as plain text',
  ])
  expect(lintLoop(`then call /tutor. ${ok}`, names)).toEqual(['/tutor is user-only: a loop pass gets it as plain text'])
  for (const l of [`run /add-posts-v2; ${ok}`, `check the add-posts queue; ${ok}`, `read /tutor.md and /tutor/notes.md; ${ok}`]) {
    expect(lintLoop(l, names)).toEqual([])
  }
})

// ── reading a SKILL.md ────────────────────────────────────────────────────────

test('userOnlyName reads the flag from the frontmatter only, in its YAML spellings, and prefers the name', () => {
  expect(userOnlyName('---\nname: tutor\ndisable-model-invocation: true\n---\n# Tutor', 'tutor-folder')).toBe('tutor')
  expect(userOnlyName('---\r\ndescription: x\r\ndisable-model-invocation: true\r\n---\r\nbody', 'anki')).toBe('anki')
  expect(userOnlyName('﻿---\nname: "ideogram4"\ndisable-model-invocation: true\n---\n', 'f')).toBe('ideogram4')
  expect(userOnlyName('---\ndisable-model-invocation: True\n---\n', 'a')).toBe('a')
  expect(userOnlyName('---\ndisable-model-invocation: "true"\n---\n', 'b')).toBe('b')
  expect(userOnlyName('---\ndisable-model-invocation: true # set 2026-10-06\n---\n', 'c')).toBe('c')
  // not user-only: false, missing, or only mentioned in the body
  expect(userOnlyName('---\nname: krea2\ndisable-model-invocation: false\n---\n', 'krea2')).toBeNull()
  expect(userOnlyName('---\nname: krea2\n---\ndisable-model-invocation: true\n', 'krea2')).toBeNull()
  expect(userOnlyName('no frontmatter\ndisable-model-invocation: true', 'x')).toBeNull()
})

// ── ++deep: the proof and the size ────────────────────────────────────────────

const ONLY_US = 'the proof is only you or me looking: name an outside check'
const SHORT = 'Fix the SSO login bug. Start from logs/auth.log. Done when the SSO end-to-end test passes on a clean clone.'

test('a deep draft with an outside proof and a short rewrite passes clean (negative control)', () => {
  for (const proof of [
    'the SSO end-to-end test passes on a clean clone',
    'I check that `pytest -k sso` exits 0',
    'a person who is neither of us reads it and signs off',
    'someone other than you or me reads it and agrees',
    'the totals match the bank statement',
    'its p95 latency is under 200 ms in the load test',
  ]) {
    expect([proof, lintDeep(proof, SHORT)]).toEqual([proof, []])
  }
})

test('a proof that is only one of us looking is flagged, in its common wordings', () => {
  for (const proof of ['you review it', 'I look over the page and confirm', 'Claude confirms it works', 'you or I read it through', 'we agree it is right']) {
    expect([proof, lintDeep(proof, SHORT)]).toEqual([proof, [ONLY_US]])
  }
})

test('a taste word as the proof is flagged once, even when it is also only us looking', () => {
  expect(lintDeep('it looks good on the page', SHORT)).toEqual(['the proof "looks good" is a taste word, not an outside check'])
  expect(lintDeep('you review it and it looks right', SHORT)).toEqual([ONLY_US])
})

test('a missing rewrite, and one past the word cap, are flagged; a missing proof is the card part check, not this one', () => {
  expect(lintDeep('the test passes', '')).toEqual(['no rewritten prompt: nothing to send'])
  expect(lintDeep('the test passes', '  \n ')).toEqual(['no rewritten prompt: nothing to send'])
  const atCap = Array.from({ length: DEEP_WORDS }, () => 'word').join(' ')
  expect(lintDeep('the test passes', atCap)).toEqual([])
  expect(lintDeep('the test passes', `${atCap} more`)).toEqual([`the rewrite is ${DEEP_WORDS + 1} words: bigger, not deeper?`])
  expect(lintDeep(undefined, SHORT)).toEqual([])
})

test('a rewrite that calls a user-only skill is flagged; wordCount counts words, not spaces', () => {
  expect(lintDeep('the test passes', `${SHORT} Then run /tutor.`, ['tutor'])).toEqual(['/tutor is user-only: Claude cannot call it, so you type it'])
  expect(lintDeep('the test passes', `${SHORT} Read /tutor.md first.`, ['tutor'])).toEqual([])
  expect(wordCount('  one two\n\nthree  ')).toBe(3)
  expect(wordCount('')).toBe(0)
})

test('a user-only skill the rewrite says you type is what the instruction asks for, and is not flagged', () => {
  for (const said of ["First I'll type /tutor, then", 'you type `/tutor` yourself first', 'Step 1 (you type it): /tutor']) {
    expect([said, lintDeep('the test passes', `${SHORT} ${said}`, ['tutor'])]).toEqual([said, []])
  }
  // a step Claude would run is still flagged, even with "type" earlier in the sentence
  expect(lintDeep('the test passes', `${SHORT} Type a summary. Then run /tutor.`, ['tutor'])).toEqual([
    '/tutor is user-only: Claude cannot call it, so you type it',
  ])
})

// Cases from the adversarial review and the live trial (2026-10-19): the old check fired on people
// described with "I", "we" or "us", and let any proof with a number through.
test('other people described with "I", "we" or "us" are outside the two of us', () => {
  for (const proof of [
    'an editor I trust reviews it',
    'a security engineer we hire reviews the diff',
    'a colleague who has never worked with us reviews it',
    'anyone but you or me reads it and says where they got lost',
    'I check the totals against the bank statement',
  ]) {
    expect([proof, lintDeep(proof, SHORT)]).toEqual([proof, []])
  }
})

test('a proof that is still one of us looking is flagged, with or without a number in it', () => {
  for (const proof of [
    'your own review of the final draft',
    'my own read of it',
    'I look it over and confirm it is right',
    'you read all 12 pages and confirm nothing is missing',
    'you review the 4 renders and pick the best one',
    'I look over the 2 drafts',
    'the owner likes it',
    'you decide whether it captures the mood',
  ]) {
    expect([proof, lintDeep(proof, SHORT)]).toEqual([proof, [ONLY_US]])
  }
})

test('a taste word beside a measurement is a description, not the check', () => {
  for (const proof of ['a 10x load test shows it stays robust', 'its BLEU score against a high-quality human reference']) {
    expect([proof, lintDeep(proof, SHORT)]).toEqual([proof, []])
  }
  expect(lintDeep('it is robust', SHORT)).toEqual(['the proof "robust" is a taste word, not an outside check'])
})

// ── ++panel: five experts, two critics, different fields, methods ─────────────

const expert = (field: string, critic = false, methods = `method for ${field}`, work = 'does the work') => ({ field, critic, work, methods })
const FIVE = [expert('Designer'), expert('Writer'), expert('Support lead'), expert('Usability tester', true), expert('Security reviewer', true)]

test('a panel of five, two critics, different fields, each with methods passes clean (negative control)', () => {
  expect(lintPanel(FIVE)).toEqual([])
})

test('the wrong number of experts or critics is flagged', () => {
  expect(lintPanel(FIVE.slice(0, 4))).toEqual(['4 experts, not five', '1 marked as critics, not two'])
  expect(lintPanel([...FIVE, expert('Lawyer')])).toEqual(['6 experts, not five'])
  expect(lintPanel(FIVE.map(x => ({ ...x, critic: false })))).toEqual(['0 marked as critics, not two'])
  expect(lintPanel([])).toEqual(['0 experts, not five', '0 marked as critics, not two'])
})

test('a repeated field (any case), an empty line of work and a line with no methods are flagged', () => {
  expect(lintPanel([...FIVE.slice(0, 4), expert('designer', true)])).toEqual(['designer appears twice: the fields should differ'])
  expect(lintPanel([...FIVE.slice(0, 4), expert('Security reviewer', true, '', '')])).toEqual(['Security reviewer: nothing they would do'])
  expect(lintPanel([...FIVE.slice(0, 4), expert('Security reviewer', true, '', 'checks for secrets')])).toEqual(['Security reviewer: no methods named'])
  expect(lintPanel([...FIVE.slice(0, 4), expert('Security reviewer', true, 'none', 'checks for secrets')])).toEqual(['Security reviewer: no methods named'])
  expect(lintPanel([...FIVE.slice(0, 4), expert('Security reviewer', true, 'a secret scan', 'checks for secrets')])).toEqual([])
})

test('generic methods and two names for one field are flagged; a real method beside a generic one is fine', () => {
  expect(lintPanel([...FIVE.slice(0, 4), expert('Security reviewer', true, 'best practices, industry standards')])).toEqual([
    'Security reviewer: only generic methods ("best practices, industry standards")',
  ])
  expect(lintPanel([...FIVE.slice(0, 4), expert('Security reviewer', true, 'best practices and a secret scan')])).toEqual([])
  const perf = [expert('Web performance engineer'), expert('Web performance specialist'), expert('Writer'), expert('Usability tester', true), expert('Security reviewer', true)]
  expect(lintPanel(perf)).toEqual(['Web performance engineer and Web performance specialist look like the same field'])
  // different fields that share a role word are not the same field
  const auditors = [expert('Data-integrity auditor', true), expert('Security auditor', true), expert('Writer'), expert('Designer'), expert('Support lead')]
  expect(lintPanel(auditors)).toEqual([])
})

test('a long reply outside the panel block is flagged; a short line is not', () => {
  expect(lintPanel(FIVE, [], 120)).toEqual([])
  expect(lintPanel(FIVE, [], 301)).toEqual(['the reply says more outside the panel: read it before Go, it may ask something or start the work'])
})

// ── done-when lines and nearer steps (0.9.1), tightened after the 2026-10-21 hostile review and replay ──

const READERS = [
  { reader: 'new hire', test: 'sets up the machine from the guide alone; test: they follow it cold, run by the owner' },
  { reader: 'agent', test: 'cold-start run, run by Claude' },
]
// his request in the run that drifted, shortened the way the reviewer's probe sent it
const REQ =
  'how can a first joiner who know nothing about the domain knowledge and tech stack onboard to this codebase with AI help? give me a runbook'
const BY_AGENT = (r: string) =>
  `Done when, ${r}: a person's need is tested only by an agent: name a person in "run by", and a stated limit does not replace that`
const NO_QUOTE = (r: string) => `Done when, ${r}: quote the words of the request this reader needs`
const NO_JOINER = 'no done-when line for "first joiner", whom the request names'
// a first-joiner line that holds: his words, a test of those very words, a person running it
const JOINER = {
  reader: 'first joiner',
  test: 'they explain the domain and the tech stack back; test: cold read, run by you',
  quotes: ['know nothing about the domain knowledge and tech stack'],
}

test('done-when lines: none is flagged, so are a line with no reader and one with no test; real ones pass (negative control)', () => {
  expect(lintPanel(FIVE, [], 0, READERS)).toEqual([])
  expect(lintPanel(FIVE)).toEqual([]) // a card from before 0.9.1 has no lines and is not judged on them
  expect(lintPanel(FIVE, [], 0, [])).toEqual(['no "Done when, <reader>:" line: name each reader of the result and the test that settles it'])
  expect(lintPanel(FIVE, [], 0, [{ reader: '', test: 'it reads well' }])).toEqual(['a done-when line names no reader: "it reads well"'])
  expect(lintPanel(FIVE, [], 0, [{ reader: 'team lead', test: '' }])).toEqual(['Done when, team lead: no test'])
  expect(lintPanel(FIVE, [], 0, [{ reader: 'team lead', test: 'n/a' }])).toEqual(['Done when, team lead: no test'])
})

test('a reader is a person or not by its head noun; an -ing phrase after a noun ends the reader (2026-10-22 E2 replay)', () => {
  const cases: [string, boolean][] = [
    ['the AI agent doing the build', false],
    ['agent following the runbook', false],
    ['coding agent', false],
    ['the coding agent', false],
    ['a code-reviewing agent', false],
    ['first joiner reading the runbook', true],
    ['first joiner using an AI agent', true],
    // only the split on "with", "who" and the like holds these: there is no -ing word to cut at
    ['first joiner with an AI agent', true],
    ['the owner who asks an agent', true],
    ['later maintainer of the guide', true],
  ]
  for (const [reader, person] of cases) expect([reader, isPersonReader(reader)]).toEqual([reader, person])
})

test("a person's need tested only by an agent is flagged, and a stated limit does not clear it (2026-10-21 review)", () => {
  // the reviewer's panel: the first joiner is tested by a subagent
  const joiner = { reader: 'first joiner', test: 'they run the app and fix a starter bug from the runbook alone; test: a fresh subagent follows it cold, run by Claude' }
  expect(lintPanel(FIVE, [], 0, [joiner])).toEqual([BY_AGENT('first joiner')])
  expect(lintPanel(FIVE, [], 0, [{ ...joiner, test: 'they fix a starter bug; test: three-arm replay, run by me' }])).toEqual([BY_AGENT('first joiner')])
  // the 0.9.1 drift: the limit is stated, and it is still the drift
  expect(lintPanel(FIVE, [], 0, [{ ...joiner, test: `${joiner.test}; cannot measure: whether a person learns the domain` }])).toEqual([BY_AGENT('first joiner')])
  // only the line's own "run by" counts: a person word elsewhere in it does not
  expect(lintPanel(FIVE, [], 0, [{ ...joiner, test: 'a fresh subagent follows it cold and a person skims its log, run by Claude' }])).toEqual([BY_AGENT('first joiner')])
  expect(lintPanel(FIVE, [], 0, [{ ...joiner, test: 'a person reads the summary; test: lint pass, run by an automated check' }])).toEqual([BY_AGENT('first joiner')])
  // no runner named at all
  expect(lintPanel(FIVE, [], 0, [{ reader: 'first joiner', test: 'cold read' }])).toEqual(['Done when, first joiner: say who runs the test ("run by …")'])
  // a person runs it: clean, in each usual wording
  for (const test of ['they follow it cold, run by the owner', 'a cold run, run by you', 'a person new to the stack follows it cold, run by a colleague', 'think-aloud, run by the owner or a newcomer he names']) {
    expect([test, lintPanel(FIVE, [], 0, [{ reader: 'first joiner', test }])]).toEqual([test, []])
  }
  // the reader's head noun decides: an agent or a tool may be tested by an agent; "a joiner using an AI agent" is a joiner
  for (const reader of ['agent', 'coding agent', "Claude Code's skill loader", 'CI pipeline']) {
    expect([reader, lintPanel(FIVE, [], 0, [{ reader, test: 'cold-start run, run by me' }])]).toEqual([reader, []])
  }
  expect(lintPanel(FIVE, [], 0, [{ reader: 'first joiner using an AI agent', test: 'cold-start run, run by me' }])).toEqual([BY_AGENT('first joiner using an AI agent')])
})

test("with the request known, a person's line quotes his words about them, and its test checks those words", () => {
  // the three human lines from the replay (0.9.1), word for word: none quotes his request
  for (const test of [
    'you fix the seeded bug in the pilot repo from the runbook and diagrams alone; test: a cold run, run by you',
    'from the runbook and diagrams alone you set up the pilot, run its tests and point to the code behind one bug; test: you follow it cold, run by you',
    'they build, run the tests and fix a first bug from the pack alone; test: a person new to the stack follows it cold, run by you or a new colleague (I cannot run it)',
  ]) {
    expect([test, lintPanel(FIVE, [], 0, [{ reader: 'first joiner', test, quotes: [] }], REQ)]).toEqual([test, [NO_QUOTE('first joiner')]])
  }
  // his words quoted and tested: clean, also with case and punctuation changed
  expect(lintPanel(FIVE, [], 0, [JOINER], REQ)).toEqual([])
  expect(lintPanel(FIVE, [], 0, [{ ...JOINER, quotes: ['Know nothing about the domain knowledge, and tech stack'] }], REQ)).toEqual([])
  // quoted, but the test leaves the need out (the replay's 0.9.2 run 2), or covers one word in three (run 1)
  expect(lintPanel(FIVE, [], 0, [{ ...JOINER, test: 'they set up, run the tests and fix one seeded bug; test: cold follow, run by the owner' }], REQ)).toEqual([
    'Done when, first joiner: the test leaves out the need it quotes: domain, tech, stack',
  ])
  expect(lintPanel(FIVE, [], 0, [{ ...JOINER, test: 'they run the repo, explain its domain back and fix one bug; test: think-aloud, run by the owner' }], REQ)).toEqual([
    'Done when, first joiner: the test leaves out the need it quotes: tech, stack',
  ])
  // his words, but not the ones about the joiner
  expect(lintPanel(FIVE, [], 0, [{ ...JOINER, quotes: ['how can a first joiner who know nothing about the domain knowledge and tech stack'] }], REQ)).toEqual([])
  expect(lintPanel(FIVE, [], 0, [{ ...JOINER, quotes: ['onboard to this codebase with AI help'] }], REQ)).toContain(
    "Done when, first joiner: quote the request's words about the first joiner",
  )
  // words he never wrote, or too few of his to hold the test to
  expect(lintPanel(FIVE, [], 0, [{ ...JOINER, quotes: ['a guide new hires can follow'] }], REQ)).toEqual([
    'Done when, first joiner: "a guide new hires can follow" is not in the request',
  ])
  expect(lintPanel(FIVE, [], 0, [{ ...JOINER, quotes: ['runbook'] }], REQ)).toEqual(['Done when, first joiner: "runbook" is too short to hold the test to the request'])
  // the person the request names must have a line; an implied reader says so instead of quoting
  expect(lintPanel(FIVE, [], 0, [{ reader: 'agent', test: 'cold-start run, run by me' }], REQ)).toEqual([NO_JOINER])
  expect(lintPanel(FIVE, [], 0, [JOINER, { reader: 'later maintainer', test: 'they find each stale claim; test: drift check, run by you', quotes: [], implied: true }], REQ)).toEqual([])
  // without the request (an older card) no quote or named-person check runs
  expect(lintPanel(FIVE, [], 0, [{ reader: 'first joiner', test: 'a cold run, run by you' }])).toEqual([])
})

test('precision (2026-10-21, 10 good replies flagged): a limit quote is not a need, filler is not a need, half the words is enough', () => {
  const H1 =
    "My company's finance analysts know Excel but have never used Python. Get an AI agent to go through our pricing-engine repo and build them a guide, so they can find the discount rules and check a customer's quote by hand."
  // a real E2 reply, word for word: right in meaning, flagged by the first coverage rule for "but, have, python"
  const analysts = {
    reader: 'finance analysts',
    test: "each analyst finds every rule and matches a real quote to the cent using the guide and Excel only; test: two analysts work cold and think aloud, run by the owner (or analysts the owner names)",
    quotes: ['know Excel but have never used Python', "find the discount rules and check a customer's quote by hand"],
  }
  expect(lintPanel(FIVE, [], 0, [analysts], H1)).toEqual([])
  // the drift itself stays flagged: none of the quoted need is in the test
  expect(lintPanel(FIVE, [], 0, [{ ...analysts, test: 'they open the repo and run its tests; test: cold run, run by the owner' }], H1)).toEqual([
    'Done when, finance analysts: the test leaves out the need it quotes: find, discount, rules, customer, quote',
  ])
  // a word and its other ending are one word: "the top risks" covers "risky"
  const H2 =
    "I'm a product manager joining a team that owns a Kotlin Android app. I can't code. Get an AI agent to read the code and make me something that explains which screens exist, what each feature does for users, and which parts are risky to change, so I can talk to the engineers."
  const owner = {
    reader: 'the owner',
    test: 'they can name each screen, its user value and the top risks with no term unexplained; test: read cold, explain back three screens and two risks, run by the owner',
    quotes: ['explains which screens exist, what each feature does for users, and which parts are risky to change'],
  }
  expect(lintPanel(FIVE, [], 0, [owner], H2)).toEqual([])
})

test('warnings about the person the request names come first', () => {
  const other = { reader: 'runbook reader', test: 'every command runs; test: run each step, run by Claude' }
  const drifted = { reader: 'first joiner', test: 'they fix a bug; test: cold run, run by you', quotes: ['know nothing about the domain knowledge and tech stack'] }
  expect(lintPanel(FIVE, [], 0, [other, drifted], REQ)[0]).toBe('Done when, first joiner: the test leaves out the need it quotes: domain, tech, stack')
})

test('a method that needs people is flagged unless its own line names a nearer step', () => {
  const needs = ['Usability tester: needs people Claude does not have: add "nearest step: …; cannot measure: …" to this line']
  const people = (methods: string, work = 'watches two people follow it cold') => [...FIVE.slice(0, 4), expert('Field tester', true, methods, work)]
  const fix = (methods: string, done = [READERS[1]!]) => lintPanel(people(methods), [], 0, done).map(w => w.replace('Field tester', 'Usability tester'))
  // the old happy-path fixture line: people are needed and nothing says how
  expect(fix('think-aloud test, task success rate')).toEqual(needs)
  expect(fix('user interviews, card sorting')).toEqual(needs)
  // a person running some other test does not clear it (2026-10-21 review)
  expect(fix('think-aloud test, task success rate', READERS)).toEqual(needs)
  // a nearer step with its limit on this line: clean
  expect(fix('think-aloud test; nearest step: a fresh subagent follows it; cannot measure: where a person stalls')).toEqual([])
})

test('a swapped method must say what the nearer step cannot measure, in any of the usual wordings', () => {
  const swap = (work: string, methods: string, extra: Partial<{ swap: string; limit: string }> = {}) => [
    ...FIVE.slice(0, 4),
    { ...expert('Field tester', true, methods, work), ...extra },
  ]
  const flag = ['Field tester: names a nearer step but not what it cannot measure']
  // the line from the 2026-10-20 run, and the reviewer's other wordings
  for (const [work, methods] of [
    ['has a fresh agent fix a closed bug', 'cold-start success (a human think-aloud needs a person; a fresh subagent is the nearest step)'],
    ['a subagent stands in for two new hires', 'cold-start run'],
    ['a fresh subagent instead of two new hires follows it', 'task success rate'],
    ['the closest we can do here is a fresh subagent', 'task success rate'],
    ['a subagent plays the newcomer in lieu of people', 'stall log'],
    ['a subagent will follow it rather than a person', 'stall log'],
    ['uses an LLM as a proxy reader', 'task success rate'],
  ]) {
    expect([work, lintPanel(swap(work!, methods!))]).toEqual([work, flag])
  }
  // a parsed nearest step with no limit, or an empty one
  expect(lintPanel(swap('follows it cold', 'cold-start run', { swap: 'a fresh subagent' }))).toEqual(flag)
  expect(lintPanel(swap('follows it cold', 'cold-start run', { swap: 'a fresh subagent', limit: 'nothing important' }))).toEqual(flag)
  // "misses" that describes the method is not a limit
  expect(lintPanel(swap('logs each step the agent misses', 'stall-point log (a fresh subagent is the nearest step)'))).toEqual(flag)
  // the limit stated, in several forms, typographic apostrophe included: clean
  for (const limit of ['cannot measure: where a person gets lost', "can't tell whether a person gets oriented", 'can’t measure where a person gets lost', 'does not show what a person grasps at a glance']) {
    expect([limit, lintPanel(swap('has a fresh agent fix a closed bug', `cold-start success; a fresh subagent is the nearest step; ${limit}`))]).toEqual([limit, []])
  }
  expect(lintPanel(swap('follows it cold', 'cold-start run', { swap: 'a fresh subagent', limit: 'where a person gets lost' }))).toEqual([])
})

test('reasonable panels are not flagged as swaps', () => {
  const line = (work: string, methods: string) => [...FIVE.slice(0, 4), expert('Field tester', true, methods, work)]
  for (const [work, methods] of [
    ['checks the corporate proxy settings for the build', 'proxy config diff'],
    ['turns the manual deploy checklist into a CI job that runs it instead of a person', 'pipeline dry run'],
    ['writes tables instead of prose', 'plain-language review'],
    ['plays back the recordings for the team', 'clip review'],
  ]) {
    expect([work, lintPanel(line(work!, methods!))]).toEqual([work, []])
  }
})

test('a nearest-step clause does not hide generic methods', () => {
  const line = (methods: string) => [...FIVE.slice(0, 4), { ...expert('Field tester', true, methods), swap: 'a fresh subagent', limit: 'where people stall' }]
  expect(lintPanel(line('testing'))).toEqual(['Field tester: only generic methods ("testing")'])
})

test('a done-when line that swaps a person for an agent must state the limit too', () => {
  const senior = { reader: 'senior on the team', test: 'they confirm the architecture section; test: expert review, run by them (nearest step here: compare against the repo docs)' }
  expect(lintPanel(FIVE, [], 0, [senior])).toEqual([
    'Done when, senior on the team: names a nearer step but not what it cannot measure',
  ])
  expect(lintPanel(FIVE, [], 0, [{ ...senior, test: `${senior.test}; cannot measure: rules that live only in their heads` }])).toEqual([])
})

test('a panel that names a user-only skill as a method is flagged once, unless it says you type it', () => {
  const names = ['tutor']
  expect(lintPanel([...FIVE.slice(0, 4), expert('Trainer', true, '/tutor, spaced recall', 'drills it')], names)).toEqual([
    '/tutor is user-only: Claude cannot call it, so you type it',
  ])
  expect(lintPanel([...FIVE.slice(0, 4), expert('Trainer', true, 'you type /tutor yourself, spaced recall', 'drills it')], names)).toEqual([])
})

// ── 2026-10-24 eval fixes ────────────────────────────────────────────────────────

const UPSTREAM =
  '"@{u}" or "ahead" needs an upstream branch, which a new branch lacks: for "not pushed", git log --branches --not --remotes lists commits on no remote'

test('a goal check that needs an upstream branch is flagged: @{u} and "status -sb … ahead"', () => {
  // the two drafts from the eval, cut to the clause that failed on a branch with no upstream
  expect(lintGoal(`${CAPPED_GOAL} start.txt holds \`git rev-parse @{u}\`, identical now.`)).toEqual([UPSTREAM])
  expect(lintGoal(`${CAPPED_GOAL} \`git status -sb\` shows ahead, not pushed.`)).toEqual([UPSTREAM])
  expect(lintGoal(`${CAPPED_GOAL} \`git rev-parse @{upstream}\` unchanged.`)).toEqual([UPSTREAM])
  // the suggested replacement, and "ahead" in other senses, are not flagged
  expect(lintGoal(`${CAPPED_GOAL} \`git log --branches --not --remotes\` lists the one commit.`)).toEqual([])
  expect(lintGoal(`${CAPPED_GOAL} The plan goes ahead only after the check.`)).toEqual([])
})

test('a deep rewrite that asks for an output the request never named is flagged; one the request named is not', () => {
  const flag = (w: string) => `the rewrite asks for "${w}", which your request never named: a new deliverable?`
  // the eval's dinner plan, which came back with a nutrient breakdown
  expect(lintDeep('the test passes', `${SHORT} Add a per-serving nutrient breakdown.`, [], 'plan a week of healthy dinners')).toEqual([flag('breakdown')])
  expect(lintDeep('the test passes', `${SHORT} Put the results in a table.`, [], 'fix the login bug')).toEqual([flag('table')])
  // singular in the request, plural in the rewrite, and the other way round
  expect(lintDeep('the test passes', `${SHORT} Keep both tables.`, [], 'make a table of the prices')).toEqual([])
  expect(lintDeep('the test passes', `${SHORT} One analysis per region.`, [], 'compare the analyses')).toEqual([])
  // a kind of output read as a source, with no verb that makes it, is not an added output
  expect(lintDeep('the test passes', `${SHORT} Start from the architecture diagram, not the ticket summary.`, [], 'fix the login bug')).toEqual([])
  // no request (a card from before 0.9.3) is not judged on it; verbs such as "report" and "audit" never are
  expect(lintDeep('the test passes', `${SHORT} Put it in a table.`)).toEqual([])
  expect(lintDeep('the test passes', `${SHORT} Report pass or fail, then audit the log.`, [], 'fix the login bug')).toEqual([])
  // a ban names the output only to keep it out (the 2026-10-25 re-run's dinner plan); a break before the verb ends it
  const dinners = 'plan a week of healthy dinners'
  expect(lintDeep('the test passes', `${SHORT} Do not add these checks, or any nutrition table, to the reply.`, [], dinners)).toEqual([])
  expect(lintDeep('the test passes', `${SHORT} Never include a summary.`, [], dinners)).toEqual([])
  expect(lintDeep('the test passes', `${SHORT} Do not stop; add a table.`, [], dinners)).toEqual([flag('table')])
  expect(lintDeep('the test passes', `${SHORT} Not that one. Add a table.`, [], dinners)).toEqual([flag('table')])
})

// ── 2026-10-25 re-run fixes ──────────────────────────────────────────────────────

test('a loop that tells you to type a user-only skill is a reminder, not a step it runs; one that runs it is still flagged', () => {
  const names = ['civitai-daily-buzz']
  const ok = 'if nothing changed, say so in one line'
  // the three reminder loops from the re-run, cut to the clause the card flagged
  for (const l of [
    `24h read last-run.json; if older, say "Type /civitai-daily-buzz yourself." ${ok}`,
    `24h if not done, say the run stopped partway, so type /civitai-daily-buzz again. ${ok}`,
    `24h say in one line: "Buzz not collected yet today: type /civitai-daily-buzz yourself." ${ok}`,
  ]) {
    expect([l, lintLoop(l, names)]).toEqual([l, []])
  }
  expect(lintLoop(`24h run /civitai-daily-buzz; ${ok}`, names)).toEqual(['/civitai-daily-buzz is user-only: a loop pass gets it as plain text'])
})

test('a deep rewrite after questions has room for the answers; one with no questions keeps the old cap', () => {
  const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ')
  expect(lintDeep('the test passes', words(DEEP_WORDS + 24), [], undefined, true)).toEqual([])
  expect(lintDeep('the test passes', words(DEEP_WORDS_ASKED), [], undefined, true)).toEqual([])
  expect(lintDeep('the test passes', words(DEEP_WORDS_ASKED + 1), [], undefined, true)).toEqual([`the rewrite is ${DEEP_WORDS_ASKED + 1} words: bigger, not deeper?`])
  expect(lintDeep('the test passes', words(DEEP_WORDS + 24))).toEqual([`the rewrite is ${DEEP_WORDS + 24} words: bigger, not deeper?`])
})

test('a panel with more done-when lines than the cap is flagged; one at the cap is not', () => {
  const line = (i: number) => ({ reader: `agent ${i}`, test: 'cold-start run, run by Claude' })
  const atCap = Array.from({ length: PANEL_DONE_MAX }, (_, i) => line(i))
  expect(lintPanel(FIVE, [], 0, atCap)).toEqual([])
  expect(lintPanel(FIVE, [], 0, [...atCap, line(99)])).toEqual([`${PANEL_DONE_MAX + 1} done-when lines, more than ${PANEL_DONE_MAX}: merge readers who need the same thing`])
})

test('grill mode lifts the length caps: no word cap on a deep rewrite, no done-when cap on a panel', () => {
  const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ')
  expect(lintDeep('the test passes', words(DEEP_WORDS_ASKED + 100), [], undefined, true, true)).toEqual([])
  const many = Array.from({ length: PANEL_DONE_MAX + 4 }, (_, i) => ({ reader: `agent ${i}`, test: 'cold-start run, run by Claude' }))
  expect(lintPanel(FIVE, [], 0, many, undefined, true)).toEqual([])
  expect(lintPanel(FIVE, [], 0, many)).toHaveLength(1)
})

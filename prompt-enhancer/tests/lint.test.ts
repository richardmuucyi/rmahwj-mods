import { expect, test } from 'claude-code/testing'

import { GOAL_LIMIT, lintGoal, lintLoop, userOnlyName } from '../hooks/lint'

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

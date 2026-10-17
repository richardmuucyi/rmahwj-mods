// Today's line in the Context tab: how many decisions the pilot log holds for today (every session's files in
// guard/<today>/), how many had the buttons on offer, and the saving summed over those. Surface-independent
// beyond the tab itself, so one surface is enough.
import { expect, mock, test } from 'claude-code/testing'

import { BAND, PANE_PROPS, bottom, measure, rig } from './guard-bottom'

const REPO = '/home/me/vault'
const BOARD = '/home/me/.claude/session-board'
const NOWMS = new Date(2026, 9, 13, 10, 0, 0).getTime()
const DAYDIR = `${BOARD}/guard/2026-10-13`
const surface = 'terminal' as const

const toolResults = () => ({ result: 'ok' })

/** One log line the way the writer makes it. */
const line = (o: Record<string, unknown> = {}) => JSON.stringify({ ctx: 312_000, chip: 'advise', advised: false, saving: 0.0403, ...o })

/** Other sessions' files today, a file of yesterday, and a file that is not a log. */
function seed(r: ReturnType<typeof rig>) {
  r.files.set(`${DAYDIR}/other.jsonl`, `${line({ ctx: 512_000, advised: true, saving: 0.0823 })}\n${line()}\n{"ts":1,"ctx":5`)
  r.files.set(`${DAYDIR}/third.jsonl`, `${line({ ctx: 555_000, advised: true, saving: 0.0914 })}\n`)
  r.files.set(`${BOARD}/guard/2026-10-12/other.jsonl`, `${line({ advised: true, saving: 0.5 })}\n`)
  r.files.set(`${DAYDIR}/notes.txt`, `${line({ advised: true, saving: 0.7 })}\n`)
}

async function turn($: any, id: string) {
  await $.turn.start({ text: 'go', turnId: id })
  await $.tool.call({ tool: 'Bash', command: 'git add -A && git commit -m done' })
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: id, reason: 'answer' })
}

/** The Context tab's day line, whitespace folded; '' when it is not drawn. */
async function dayLine(pane: any): Promise<string> {
  const found = await pane.find({ key: 'sb-guard-day' })
  return found ? found.text.replace(/\s+/g, ' ').trim() : ''
}

/** The panel on its Context tab, once the first read has had a second to finish. */
async function openContext($: any, clock: { advance: (ms: number) => Promise<void> }) {
  const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
  await pane.press({ key: 'sb-tab-context' })
  await clock.advance(1_000)
  return pane
}

test('day line: a day with no log says so, under the label', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  const pane = await openContext($, clock)
  const text = await dayLine(pane)
  expect(text).toContain('pilot log today')
  expect(text).toContain('no decisions logged yet')
  await pane.unmount()
})

test('day line: every session’s files of today are counted; yesterday, a non-log file and a half-written line are not', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  seed(r)
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  const pane = await openContext($, clock)
  expect(await dayLine(pane)).toContain('3 decisions · 2 advised · $0.17 per request, summed')
  await pane.unmount()
})

test('day line: a decision this session logs is in the line without reopening the tab', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  seed(r)
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  const pane = await openContext($, clock)
  expect(await dayLine(pane)).toContain('3 decisions · 2 advised')
  await turn($, 't1')
  await $.session.measure(measure(512_000))
  await clock.advance(1_000)
  // the new line is in this session’s file, and the open tab counts it: 3 + 1 decisions, 2 + 1 advised
  expect((r.files.get(`${DAYDIR}/me.jsonl`) ?? '').includes('"advised":true')).toBe(true)
  expect(await dayLine(pane)).toContain('4 decisions · 3 advised · $0.26 per request, summed')
  await pane.unmount()
})

test('day line: another session’s new decision shows when the tab is pressed again', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  seed(r)
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  const pane = await openContext($, clock)
  expect(await dayLine(pane)).toContain('3 decisions · 2 advised')
  r.files.set(`${DAYDIR}/fourth.jsonl`, `${line({ ctx: 600_000, advised: true, saving: 0.1 })}\n`)
  await pane.press({ key: 'sb-tab-context' })
  await clock.advance(100)
  expect(await dayLine(pane)).toContain('4 decisions · 3 advised · $0.27 per request, summed')
  await pane.unmount()
})

test('day line: while the tab stays open it follows the log by itself', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  seed(r)
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  const pane = await openContext($, clock)
  expect(await dayLine(pane)).toContain('3 decisions · 2 advised')
  r.files.set(`${DAYDIR}/fourth.jsonl`, `${line({ ctx: 600_000, advised: true, saving: 0.1 })}\n`)
  await clock.advance(12_000)
  expect(await dayLine(pane)).toContain('4 decisions · 3 advised')
  await pane.unmount()
})

test('day line: after midnight it counts the new day, not the old one', async ($, on) => {
  const clock = mock.clock(on, { now: new Date(2026, 9, 13, 23, 59, 50).getTime() })
  const r = rig()
  seed(r)
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  const pane = await openContext($, clock)
  expect(await dayLine(pane)).toContain('3 decisions · 2 advised')
  await clock.advance(20_000)
  expect(await dayLine(pane)).toContain('no decisions logged yet')
  await pane.unmount()
})

test('day line: it stays when the guard redraws, and across /clear', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  seed(r)
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  const pane = await openContext($, clock)
  expect(await dayLine(pane)).toContain('3 decisions · 2 advised')
  // a measure below 200K makes the guard decide again, and logs nothing
  await $.session.measure(measure(150_000))
  await clock.advance(100)
  expect(await dayLine(pane)).toContain('3 decisions · 2 advised')
  // a new session in the same process (/clear) starts the guard over; the day’s log is not the session’s
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await clock.advance(100)
  expect(await dayLine(pane)).toContain('3 decisions · 2 advised')
  await pane.unmount()
})

test('day line: opening the Context tab from the strip’s "see summary" reads the log too', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  // writes are refused, so no decision of this session fills the count before the tab opens
  const r = rig({ denyGuard: true })
  seed(r)
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await turn($, 't1')
  await $.session.measure(measure(412_000))
  await clock.advance(1_000)
  const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
  // you press Enter on a /compact (the engine fires session.compact); the strip then shows the result and "see summary"
  await $.session.compact({ messages: [{ role: 'user', text: 'edit build_compare.py', toolUses: [] }], trigger: 'manual' } as never)
  await clock.advance(1_000)
  expect(r.compacts).toHaveLength(1)
  await band.press({ key: 'sb-guard-see' })
  await clock.advance(100)
  const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
  expect(await dayLine(pane)).toContain('3 decisions · 2 advised · $0.17 per request, summed')
  await pane.unmount()
  await band.unmount()
})

test('day line: it is not in the strip above the prompt, only in the Context tab', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  seed(r)
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await turn($, 't1')
  await $.session.measure(measure(512_000))
  await clock.advance(1_000)
  const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} } })
  expect(await band.find({ key: 'sb-guard-day' })).toBeUndefined()
  await band.unmount()
  // and on the other tabs
  const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
  expect(await dayLine(pane)).toBe('')
  await pane.unmount()
})

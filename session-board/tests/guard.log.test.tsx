// The pilot log: one line per decision in ~/.claude/session-board/guard/<day>/<session>.jsonl, written at each
// turn end from 200K up. It sits beside the journal's log/ folder and must never touch it. Surface-independent
// (nothing is drawn), so one surface is enough.
import { expect, mock, test } from 'claude-code/testing'

import { PANE_PROPS, bottom, measure, rig } from './guard-bottom'
import type { Rig } from './guard-bottom'

const REPO = '/home/me/vault'
const BOARD = '/home/me/.claude/session-board'
const NOWMS = new Date(2026, 9, 13, 10, 0, 0).getTime()
const OWN = `${BOARD}/guard/2026-10-13/me.jsonl`
const surface = 'terminal' as const

const toolResults = (_$: unknown, e: { tool: string; file_path?: string }) => {
  if (e.tool === 'Edit') {
    return { result: { filePath: e.file_path, structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-a', '+b', '+c'] }], originalFile: 'a' } }
  }
  return { result: 'ok' }
}

async function turn($: any, id: string, run?: { tool: string; args: Record<string, unknown> }) {
  await $.turn.start({ text: 'go', turnId: id })
  if (run) await $.tool.call({ tool: run.tool, ...run.args })
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: id, reason: 'answer' })
}

const COMMIT = { tool: 'Bash', args: { command: 'git add -A && git commit -m done' } }

/** The decisions this session logged, parsed. */
const logged = (r: Rig, path = OWN): Record<string, any>[] =>
  (r.files.get(path) ?? '')
    .split('\n')
    .filter(l => l !== '')
    .map(l => JSON.parse(l))

/** Every file path the plugin wrote that belongs to the guard log. */
const guardFiles = (r: Rig) => [...r.files.keys()].filter(k => k.includes('/guard/'))

test('log: nothing below 200K, then one line per turn end: a dim line, an advise line', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await turn($, 't1')
  await $.session.measure(measure(150_000))
  await clock.advance(1_000)
  expect(logged(r)).toHaveLength(0)
  expect(guardFiles(r)).toHaveLength(0)
  await turn($, 't2')
  await $.session.measure(measure(212_000))
  await turn($, 't3', COMMIT)
  await $.session.measure(measure(312_000))
  await clock.advance(1_000)
  const L = logged(r)
  expect(L).toHaveLength(2)
  expect(L[0]!.chip).toBe('dim')
  expect(L[0]!.ctx).toBe(212_000)
  expect(L[0]!.would_compact).toBe(false)
  expect(L[0]!.saving).toBe(0.0193)
  expect('grade' in L[0]!).toBe(false)
  expect(L[1]!.chip).toBe('advise')
  expect(L[1]!.grade).toBe('good')
  expect(L[1]!.ctx).toBe(312_000)
  expect(L[1]!.advised).toBe(true)
  expect(L[1]!.would_compact).toBe(false)
  expect(L[1]!.saving).toBe(0.0403)
})

test('log: at 512K in advise mode it says it would have compacted, and what that saves per request', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await turn($, 't1', COMMIT)
  await $.session.measure(measure(512_000))
  await clock.advance(1_000)
  const [line] = logged(r)
  expect(line!.mode).toBe('advise')
  expect(line!.ctx).toBe(512_000)
  expect(line!.grade).toBe('good')
  expect(line!.advised).toBe(true)
  expect(line!.would_compact).toBe(true)
  expect(line!.saving).toBe(0.0823)
  expect(line!.committed).toBe(true)
  expect(line!.jobs).toBe(0)
  expect(line!.mine).toBe(0)
  expect(line!.floor).toBe(120_000)
  expect(line!.window).toBe(1_000_000)
  expect(line!.project).toBe('vault')
  expect(typeof line!.ts).toBe('number')
  expect(typeof line!.at).toBe('string')
})

test('log: held by a background job: grade hold, the reason, and no would_compact', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.agent.spawn({ prompt: 'find', description: 'Scan the vault', subagentType: 'Explore', background: true } as never)
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.session.measure(measure(555_000))
  await clock.advance(1_000)
  const [line] = logged(r)
  expect(line!.chip).toBe('held')
  expect(line!.grade).toBe('hold')
  expect(line!.reason).toBe('jobs')
  expect(line!.advised).toBe(false)
  expect(line!.would_compact).toBe(false)
  expect(line!.jobs).toBe(1)
})

test('log: an uncommitted file of this session makes it an ok moment, not a would_compact', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig({ status: [' M a.md'] })
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await turn($, 't1', { tool: 'Edit', args: { file_path: `${REPO}/a.md`, old_string: 'a', new_string: 'b' } })
  await $.session.measure(measure(512_000))
  await clock.advance(1_000)
  const [line] = logged(r)
  expect(line!.grade).toBe('ok')
  expect(line!.mine).toBe(1)
  expect(line!.committed).toBe(false)
  expect(line!.would_compact).toBe(false)
})

test('log: in auto mode the line says auto and would_compact, and one decision is one line even while the countdown runs', { options: { mode: 'auto' } }, async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await turn($, 't1', COMMIT)
  await $.session.measure(measure(512_000))
  await clock.advance(5_000)
  const L = logged(r)
  expect(L).toHaveLength(1)
  expect(L[0]!.mode).toBe('auto')
  expect(L[0]!.would_compact).toBe(true)
  // typing cancels the countdown: nothing was compacted, and still one line
  await ($.prompt as unknown as { edit: (e: unknown) => Promise<unknown> }).edit({ origin: { kind: 'composer' }, text: 'h', cursor: 1, start: 0, end: 0, inputText: 'h' })
  await clock.advance(30_000)
  expect(r.compacts).toHaveLength(0)
  expect(logged(r)).toHaveLength(1)
})

test('log: the 5-second refresh and a measure that only moved a rate limit are not decisions; neither is the same size again', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await turn($, 't1', COMMIT)
  await $.session.measure(measure(312_000))
  await clock.advance(60_000)
  expect(logged(r)).toHaveLength(1)
  await $.session.measure({ context: { window: 1_000_000, tokens: 312_000, percent: 31 }, rateLimits: [], changed: ['rateLimits'] } as never)
  expect(logged(r)).toHaveLength(1)
  // a rate-limit measure that also carries a different size is still not a turn end
  await $.session.measure({ context: { window: 1_000_000, tokens: 340_000, percent: 34 }, rateLimits: [], changed: ['rateLimits'] } as never)
  expect(logged(r)).toHaveLength(1)
  await $.session.measure(measure(312_000))
  expect(logged(r)).toHaveLength(1)
  await $.session.measure(measure(318_000))
  await clock.advance(1_000)
  expect(logged(r)).toHaveLength(2)
})

test('log: mode off writes nothing', { options: { mode: 'off' } }, async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await turn($, 't1', COMMIT)
  await $.session.measure(measure(612_000))
  await clock.advance(1_000)
  expect(guardFiles(r)).toHaveLength(0)
})

test('log: it stays out of the journal log folder, even with the journal setting on', { options: { journal: true } }, async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await turn($, 't1', COMMIT)
  await $.session.measure(measure(312_000))
  await clock.advance(2_000)
  const keys = [...r.files.keys()]
  const journal = keys.filter(k => k.startsWith(`${BOARD}/log/`))
  // the journal's own turn line is there, so this test does see the folder it protects
  expect(journal.length).toBeGreaterThanOrEqual(1)
  expect(guardFiles(r)).toEqual([OWN])
  // no guard line in the journal's files, no journal line in the guard file
  for (const k of journal) expect(r.files.get(k)!.includes('would_compact')).toBe(false)
  expect(r.files.get(OWN)!.includes('"did"')).toBe(false)
  // and nothing of the guard's sits directly under log/
  expect(keys.filter(k => k.includes('/log/') && k.includes('/guard/'))).toEqual([])
})

test('log: after a reload it adds to this session’s file, and never touches another session’s file', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  const other = `${BOARD}/guard/2026-10-13/other.jsonl`
  r.files.set(OWN, '{"old":1}\n')
  r.files.set(other, 'KEEP\n')
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await turn($, 't1', COMMIT)
  await $.session.measure(measure(312_000))
  await clock.advance(1_000)
  const text = r.files.get(OWN)!
  expect(text.startsWith('{"old":1}\n')).toBe(true)
  expect(text.split('\n').filter(l => l !== '')).toHaveLength(2)
  expect(text.endsWith('\n')).toBe(true)
  expect(r.files.get(other)).toBe('KEEP\n')
})

test('log: a refused write never breaks the guard', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig({ denyGuard: true })
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await turn($, 't1', COMMIT)
  await $.session.measure(measure(312_000))
  await clock.advance(1_000)
  expect(guardFiles(r)).toHaveLength(0)
  // the write was tried, and refused
  expect(r.denied).toEqual([OWN])
  // the chip still draws
  const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} } })
  const chip = await band.find({ key: 'sb-guard' })
  expect(chip!.text.replace(/\s+/g, ' ')).toContain('[ Compact now ]')
  await band.unmount()
  // and a later decision still tries again without an error
  await turn($, 't2')
  await $.session.measure(measure(330_000))
  await clock.advance(1_000)
  expect(guardFiles(r)).toHaveLength(0)
  expect(r.denied).toEqual([OWN, OWN])
})

test('log: no prompt text, no file names, no paths: numbers, the project name and the verdict only', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig({ status: [' M a.md'] })
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await $.prompt.submit({ text: 'my secret plan for build_compare.py', origin: { kind: 'composer' }, wait: false })
  await turn($, 't1', { tool: 'Edit', args: { file_path: `${REPO}/a.md`, old_string: 'a', new_string: 'b' } })
  await $.session.measure(measure(312_000))
  await clock.advance(1_000)
  const text = r.files.get(OWN)!
  for (const word of ['secret', 'build_compare', 'a.md', 'home/me', 'Edit']) expect(text.includes(word)).toBe(false)
})

test('log: day folders older than 30 days under guard/ are removed, the journal log and other names are not', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig({ guardDirs: ['2026-08-01', '2026-09-20', 'notes', '2026-10-12'] })
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await clock.advance(2_000)
  const removed = r.runs.filter(a => a[0] === 'rm')
  expect(removed).toEqual([['rm', '-rf', '--', `${BOARD}/guard/2026-08-01`]])
  for (const a of removed) {
    expect(a.join(' ').includes('/log/')).toBe(false)
  }
})

test('log: the Context tab still opens with the log on', async ($, on) => {
  const clock = mock.clock(on, { now: NOWMS })
  const r = rig()
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await turn($, 't1', COMMIT)
  await $.session.measure(measure(312_000))
  await clock.advance(1_000)
  const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
  await pane.press({ key: 'sb-tab-context' })
  const texts = (await pane.findAll({ type: 'Text' })).map(x => x.text.replace(/\s+/g, ' ').trim()).join(' | ')
  expect(texts).toContain('Context 312K')
  await pane.unmount()
})

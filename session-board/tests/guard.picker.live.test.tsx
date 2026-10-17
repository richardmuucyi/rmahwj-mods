// The compact picker and the Actions menu that types (0.19.0, plan 2026-10-14-session-board-compact-picker; 0.21.0: one
// Actions menu in the strip replaces the Compact, Plain, Later and /clear buttons).
// THE RULE under test: the mod types into the prompt box and you press Enter. No button or menu row, in the strip or in the
// Context tab, ever calls session.compact. The last test presses every one of them and checks that.
import { expect, mock, test } from 'claude-code/testing'

import { LEAN_SENTENCE, NOTES_SENTENCE } from '../hooks/guard'
import { BAND, PANE_PROPS, bottom, editBox, guardChips, guardText, measure, rig } from './guard-bottom'

const REPO = '/home/me/vault'
/** A compaction always holds at least one message: the engine refuses to rewrite an empty one. */
const MSGS = [{ role: 'user', text: 'we edit build_compare.py on :8199', toolUses: [] }]
const BOARD = '/home/me/.claude/session-board'

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

/** A session at 312K just after a commit: the advise chip is on. */
async function advising($: any, on: any, surface: 'terminal' | 'desktop', over: Parameters<typeof rig>[0] = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  const r = rig(over)
  r.top = $
  bottom(on, r)
  on('tool.call', toolResults)
  await $.session.start({ cwd: REPO, surface, isInteractive: true })
  await turn($, 't1', { tool: 'Bash', args: { command: 'git push' } })
  await $.session.measure(measure(312_000))
  await clock.advance(5_000)
  return { clock, r }
}

/** Another session needs you, so the strip row draws above the context row. */
async function addStrip(r: any, clock: any) {
  r.files.set(`${BOARD}/far.json`, JSON.stringify({
    changedAt: 1_000_000, seenAt: 1_000_000, id: 'far', folder: '/home/me/iams-ups', project: 'iams-ups',
    asked: 'Fix the deploy script', status: 'needs-you', activity: 'Approve: Run the deploy',
  }))
  await clock.advance(6_000)
}

/** A menu pick: open the Actions menu, then press its row. */
async function pickAction(band: any, key: string) {
  await band.press({ key: 'sb-guard-menu' })
  await band.press({ key })
}

const paneTexts = async (pane: any) => (await pane.findAll({ type: 'Text' })).map((x: any) => x.text.replace(/\s+/g, ' ').trim()).join(' | ')

/** The command the picker shows: the Text that starts with /compact (the strip and the footer never do). */
const shownCommand = async (pane: any): Promise<string> => {
  const found = (await pane.findAll({ type: 'Text' })).map((x: any) => x.text.replace(/\s+/g, ' ').trim()).filter((t: string) => t.startsWith('/compact'))
  return found.at(-1) ?? ''
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`Plain types a bare /compact into the box and runs nothing (${surface})`, async ($, on) => {
    const { r } = await advising($, on, surface)
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await pickAction(band, 'sb-guard-plain')
    await band.unmount()
    expect(r.fills).toEqual([{ text: '/compact', mode: 'replace' }])
    expect(r.compacts).toHaveLength(0)
  })

  test(`/clear types /clear into the box and runs nothing (${surface})`, async ($, on) => {
    const { r } = await advising($, on, surface)
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await pickAction(band, 'sb-guard-clear')
    // a pick closes the menu
    expect(await band.find({ key: 'sb-guard-rows' })).toBeUndefined()
    await band.unmount()
    expect(r.fills).toEqual([{ text: '/clear', mode: 'replace' }])
    expect(r.compacts).toHaveLength(0)
  })

  test(`Actions opens a menu of three picks that say what they type; a second click closes it and nothing is typed (${surface})`, async ($, on) => {
    const { r } = await advising($, on, surface)
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    expect(await band.find({ key: 'sb-guard-rows' })).toBeUndefined()
    await band.press({ key: 'sb-guard-menu' })
    const open = (await band.find({ key: 'sb-guard' }))!.text.replace(/\s+/g, ' ')
    expect(open).toContain('Actions ▴')
    expect(open).toContain('▸ Compact… choose what to keep')
    expect(open).toContain('▸ Plain compact types /compact')
    expect(open).toContain('▸ Clear types /clear')
    await band.press({ key: 'sb-guard-menu' })
    expect(await band.find({ key: 'sb-guard-rows' })).toBeUndefined()
    expect((await band.find({ key: 'sb-guard' }))!.text).toContain('Actions ▾')
    await band.unmount()
    expect(r.fills).toHaveLength(0)
    expect(r.compacts).toHaveLength(0)
  })

  test(`the Actions menu opens beneath its button, and its hints line up with three spaces after the longest label (${surface})`, async ($, on) => {
    await advising($, on, surface)
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await band.press({ key: 'sb-guard-menu' })
    const line = (await band.find({ key: 'sb-guard-line' }))!.text
    // the advice row has no chip: the button is the first thing on the row, at cell 0
    const col = line.indexOf('Actions')
    expect(col).toBe(0)
    const keys = ['sb-guard-pick', 'sb-guard-plain', 'sb-guard-clear']
    const rows = await Promise.all(keys.map(async key => (await band.find({ key }))!.text))
    // each row's marker is under the button's first letter
    expect(rows.map(r => r.indexOf('▸'))).toEqual([col, col, col])
    // every hint starts in the same cell, and the longest label has three spaces before its hint
    const hints = ['choose what to keep', 'types /compact', 'types /clear']
    const at = rows.map((r, i) => r.indexOf(hints[i]!))
    expect(new Set(at).size).toBe(1)
    expect(rows[1]).toContain('Plain compact   types /compact')
    await band.unmount()
  })

  test(`the advice row sits right under the strip with no empty row: it starts with the plain Actions button, not a black chip (${surface})`, async ($, on) => {
    const { clock, r } = await advising($, on, surface)
    // alone, the context row has nothing above it
    const alone = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    expect(await alone.find({ key: 'sb-guard' })).toBeDefined()
    expect(await alone.find({ key: 'sb-strip' })).toBeUndefined()
    expect(await alone.find({ key: 'sb-spacer' })).toBeUndefined()
    await alone.unmount()
    // another session is open: the strip row draws, and the context row follows it directly (no black chip to stack)
    await addStrip(r, clock)
    for (const bodyColumns of [120, 40]) {
      const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: { ...BAND, bodyColumns } })
      expect(await band.find({ key: 'sb-strip' }), `strip at ${bodyColumns}`).toBeDefined()
      expect(await band.find({ key: 'sb-spacer' }), `no spacer at ${bodyColumns}`).toBeUndefined()
      expect(await band.find({ key: 'sb-guard' }), `guard row at ${bodyColumns}`).toBeDefined()
      await band.unmount()
      expect(await guardChips($, surface, { bodyColumns }), `no chip at ${bodyColumns}`).toEqual([])
    }
  })

  test(`a status row starts with a black chip, so one empty row stays between it and the strip: compact failed, then compacted (${surface})`, async ($, on) => {
    const { clock, r } = await advising($, on, surface, { skip: 'nothing to compact' })
    await addStrip(r, clock)
    // a skipped compaction: the red "compact failed" chip
    await $.session.compact({ messages: MSGS, trigger: 'manual' } as never)
    await clock.advance(1_000)
    for (const bodyColumns of [120, 40]) {
      const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: { ...BAND, bodyColumns } })
      expect(await band.find({ key: 'sb-strip' }), `strip at ${bodyColumns}`).toBeDefined()
      expect(await band.find({ key: 'sb-spacer' }), `spacer at ${bodyColumns}`).toBeDefined()
      await band.unmount()
      expect((await guardChips($, surface, { bodyColumns })).map(c => c[1]), `chip at ${bodyColumns}`).toEqual([' ✗ compact failed '])
    }
    // a compaction that stands: the green "compacted" chip keeps the empty row too
    r.skip = undefined
    await $.prompt.submit({ text: 'go on', origin: { kind: 'composer' }, wait: false })
    await $.session.compact({ messages: MSGS, trigger: 'manual' } as never)
    await clock.advance(1_000)
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    expect(await band.find({ key: 'sb-spacer' })).toBeDefined()
    await band.unmount()
    expect((await guardChips($, surface)).map(c => c[1])).toEqual([' ✓ compacted '])
  })

  test(`an open menu closes when you type in the box or send a prompt (${surface})`, async ($, on) => {
    const { clock } = await advising($, on, surface)
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await band.press({ key: 'sb-guard-menu' })
    expect(await band.find({ key: 'sb-guard-rows' })).toBeDefined()
    await editBox($, 'fix it')
    await clock.advance(1_000)
    expect(await band.find({ key: 'sb-guard-rows' })).toBeUndefined()
    // emptying the box does not reopen it
    await editBox($, '')
    await clock.advance(1_000)
    expect(await band.find({ key: 'sb-guard-rows' })).toBeUndefined()
    await band.press({ key: 'sb-guard-menu' })
    expect(await band.find({ key: 'sb-guard-rows' })).toBeDefined()
    await $.prompt.submit({ text: 'go on', origin: { kind: 'composer' }, wait: false })
    await clock.advance(1_000)
    expect(await band.find({ key: 'sb-guard-rows' })).toBeUndefined()
    await band.unmount()
  })

  test(`Compact… opens the picker in the Context tab and types nothing yet (${surface})`, async ($, on) => {
    const { r } = await advising($, on, surface)
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await pickAction(band, 'sb-guard-pick')
    await band.unmount()
    expect(r.fills).toHaveLength(0)
    // the panel is asked to open before the pick switches it to the Context tab
    expect(r.openSawView.at(-1)).not.toBe('context')
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    const t = await paneTexts(pane)
    expect(t).toContain('Compact: choose what to keep')
    // the two default rows are ticked, the rest are off; the preview is the default command
    expect(t).toContain('[x] Six-part notes')
    expect(t).toContain('[x] Leave out tool output and logs')
    expect(t).toContain(`/compact ${NOTES_SENTENCE} ${LEAN_SENTENCE}`)
    await pane.unmount()
  })

  test(`picker: ticking rows builds the command, Type it types exactly that, and the picker closes (${surface})`, async ($, on) => {
    const { clock, r } = await advising($, on, surface, { status: [' M a.md'] })
    // the board's facts: a task list, an uncommitted file of this session, a background job, open assumptions
    await $.turn.start({ text: 'go', turnId: 't2' })
    await $.tool.call({
      tool: 'TodoWrite',
      todos: [
        { content: 'write the build plan', status: 'in_progress', activeForm: 'Writing the build plan' },
        { content: 'run the baseline tests', status: 'pending', activeForm: 'Running the tests' },
        { content: 'already done', status: 'completed', activeForm: 'Done' },
      ],
    })
    await $.tool.call({ tool: 'Edit', file_path: `${REPO}/a.md`, old_string: 'a', new_string: 'b' })
    await $.agent.spawn({ prompt: 'find', description: 'Scan the vault', subagentType: 'Explore', background: true } as never)
    await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't2', reason: 'answer' })
    r.files.set(`${BOARD}/me.assume`, JSON.stringify({ open: 2, high: 1 }))
    await $.session.measure(measure(330_000))
    await clock.advance(6_000)

    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    await pane.press({ key: 'sb-guard-tab-pick' })
    let t = await paneTexts(pane)
    expect(t).toContain("Open items of this session's task list (2)")
    expect(t).toContain('Uncommitted files of this session (1)')
    expect(t).toContain('Running jobs (1)')
    expect(t).toContain('Open assumptions (2)')
    expect(t).not.toContain('already done')
    for (const id of ['tasks', 'files', 'jobs', 'assumptions']) await pane.press({ key: `sb-guard-pk-${id}` })
    const command = await shownCommand(pane)
    // the six sentences, in the fixed order
    const parts = [
      `/compact ${NOTES_SENTENCE} ${LEAN_SENTENCE}`,
      'Keep in full detail: the open items of the task list: write the build plan; run the baseline tests.',
      'Keep these uncommitted files by path: a.md.',
      'Jobs still running: ',
      'Assumptions still open: 2 (1 high impact).',
    ]
    let at = -1
    for (const part of parts) {
      const i = command.indexOf(part)
      expect(i, part).toBeGreaterThan(at)
      at = i
    }
    expect(command.endsWith('Assumptions still open: 2 (1 high impact).')).toBe(true)
    await pane.press({ key: 'sb-guard-type' })
    expect(r.fills).toHaveLength(1)
    expect(r.fills[0]!.mode).toBe('replace')
    expect(r.fills[0]!.text.replace(/\s+/g, ' ').trim()).toBe(command)
    expect(r.fills[0]!.text.startsWith('/compact ')).toBe(true)
    expect(r.fills[0]!.text.includes('\n')).toBe(false)
    expect(r.compacts).toHaveLength(0)
    t = await paneTexts(pane)
    expect(t).not.toContain('Compact: choose what to keep')
    await pane.unmount()
  })

  test(`picker: a row with nothing to keep is drawn off and says so (${surface})`, async ($, on) => {
    await advising($, on, surface)
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    await pane.press({ key: 'sb-guard-tab-pick' })
    const t = await paneTexts(pane)
    expect(t).toContain("Open items of this session's task list (0) nothing to keep")
    expect(t).toContain('Running jobs (0) nothing to keep')
    expect(t).toContain('Open assumptions (0) nothing to keep')
    // the two always-on rows can be unticked: nothing ticked is a bare /compact
    await pane.press({ key: 'sb-guard-pk-notes' })
    await pane.press({ key: 'sb-guard-pk-lean' })
    expect(await shownCommand(pane)).toBe('/compact')
    await pane.unmount()
  })

  test(`picker: a subagent still running counts as a job, as it does on the chip (${surface})`, async ($, on) => {
    const { clock, r } = await advising($, on, surface)
    await $.turn.start({ text: 'go', turnId: 't2' })
    await $.agent.spawn({ prompt: 'find', description: 'Scan the vault', subagentType: 'Explore' } as never)
    await $.session.measure(measure(330_000))
    await clock.advance(6_000)
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    await pane.press({ key: 'sb-guard-tab-pick' })
    expect(await paneTexts(pane)).toContain('Running jobs (1)')
    await pane.press({ key: 'sb-guard-pk-jobs' })
    expect(await shownCommand(pane)).toContain('Jobs still running: subagent Explore')
    await pane.press({ key: 'sb-guard-type' })
    expect(r.fills).toHaveLength(1)
    expect(r.fills[0]!.text).toContain('Jobs still running: subagent Explore')
    await pane.unmount()
  })

  test(`picker: Cancel closes it without typing (${surface})`, async ($, on) => {
    const { r } = await advising($, on, surface)
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    await pane.press({ key: 'sb-guard-tab-pick' })
    expect(await paneTexts(pane)).toContain('Compact: choose what to keep')
    await pane.press({ key: 'sb-guard-pick-cancel' })
    expect(await paneTexts(pane)).not.toContain('Compact: choose what to keep')
    expect(r.fills).toHaveLength(0)
    await pane.unmount()
  })

  test(`your words in the box switch the Actions menu off, and an emptied box switches it on (${surface})`, async ($, on) => {
    const { clock, r } = await advising($, on, surface)
    expect(await guardText($, surface)).toContain('Actions ▾')
    await editBox($, 'fix the login test')
    await clock.advance(1_000)
    const off = await guardText($, surface)
    expect(off).toContain('Actions ▾')
    expect(off).toContain('the box has your text')
    // the button is plain text now: there is no Button to press and no menu to open
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    expect(await band.find({ key: 'sb-guard-menu', type: 'Button' })).toBeUndefined()
    expect(await band.find({ key: 'sb-guard-plain' })).toBeUndefined()
    await band.unmount()
    expect(r.fills).toHaveLength(0)
    // the Context tab says the same
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    expect(await paneTexts(pane)).toContain('the box has your text')
    for (const key of ['sb-guard-tab-pick', 'sb-guard-tab-plain', 'sb-guard-tab-clear']) {
      expect(await pane.find({ key, type: 'Button' }), key).toBeUndefined()
    }
    await pane.unmount()
    // the box is emptied: the menu is back, and Plain compact types
    await editBox($, '')
    await clock.advance(1_000)
    const back = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    expect((await back.find({ key: 'sb-guard-menu', type: 'Button' }))!.text).toContain('Actions')
    await pickAction(back, 'sb-guard-plain')
    await back.unmount()
    expect(r.fills).toEqual([{ text: '/compact', mode: 'replace' }])
  })

  test(`text a menu pick typed does not switch the menu off, and a later pick replaces it (${surface})`, async ($, on) => {
    const { clock, r } = await advising($, on, surface)
    let band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await pickAction(band, 'sb-guard-plain')
    await band.unmount()
    // the engine reports the edit that our own fill made: same text
    await editBox($, '/compact')
    await clock.advance(1_000)
    const t = await guardText($, surface)
    expect(t).not.toContain('the box has your text')
    band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await pickAction(band, 'sb-guard-clear')
    await band.unmount()
    expect(r.fills.map(f => f.text)).toEqual(['/compact', '/clear'])
    // you add a word to the typed command: now it is yours, and the buttons go off
    await editBox($, '/clear now')
    await clock.advance(1_000)
    expect(await guardText($, surface)).toContain('the box has your text')
  })

  test(`the engine reporting the edit of our own fill before the fill returns does not make it your typing (${surface})`, async ($, on) => {
    const { clock, r } = await advising($, on, surface, { editOnFill: true })
    expect(r.top).toBeDefined()
    let band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await pickAction(band, 'sb-guard-plain')
    await band.unmount()
    await clock.advance(1_000)
    const t = await guardText($, surface)
    expect(t).not.toContain('the box has your text')
    // so the next pick can replace it
    band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await pickAction(band, 'sb-guard-clear')
    await band.unmount()
    expect(r.fills.map(f => f.text)).toEqual(['/compact', '/clear'])
  })

  test(`a refused fill leaves the buttons as they were, even when the box reported an edit first (${surface})`, async ($, on) => {
    const { r } = await advising($, on, surface, { fillOk: false, editOnFill: true })
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await pickAction(band, 'sb-guard-plain')
    await pickAction(band, 'sb-guard-clear')
    await band.unmount()
    expect(r.fills.map(f => f.text)).toEqual(['/compact', '/clear'])
  })

  test(`a refused fill leaves the text typed before it replaceable (${surface})`, async ($, on) => {
    const { clock, r } = await advising($, on, surface)
    let band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await pickAction(band, 'sb-guard-plain')
    await band.unmount()
    await editBox($, '/compact')
    r.fillOk = false
    band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await pickAction(band, 'sb-guard-clear')
    await band.unmount()
    await clock.advance(1_000)
    // the box still holds what the first button typed, so it is still ours to replace
    expect(await guardText($, surface)).not.toContain('the box has your text')
    r.fillOk = true
    band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await pickAction(band, 'sb-guard-clear')
    await band.unmount()
    expect(r.fills.map(f => f.text)).toEqual(['/compact', '/clear', '/clear'])
  })

  test(`sending a prompt empties the box and frees the buttons (${surface})`, async ($, on) => {
    const { clock } = await advising($, on, surface)
    await editBox($, 'hello there')
    await clock.advance(1_000)
    expect(await guardText($, surface)).toContain('the box has your text')
    await $.prompt.submit({ text: 'hello there', origin: { kind: 'composer' }, wait: false })
    await clock.advance(1_000)
    expect(await guardText($, surface)).not.toContain('the box has your text')
  })

  test(`a box that refuses the fill gets a toast, and a long command points to the Context tab (${surface})`, async ($, on) => {
    const { r } = await advising($, on, surface, { fillOk: false })
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await pickAction(band, 'sb-guard-plain')
    await band.unmount()
    expect(r.toasts.at(-1)).toBe('Could not type into the prompt box. Type this by hand: /compact')
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    await pane.press({ key: 'sb-guard-tab-pick' })
    await pane.press({ key: 'sb-guard-type' })
    expect(r.toasts.at(-1)).toBe('Could not type into the prompt box. The command is shown in the Context tab of /sessions.')
    // the picker stays open so the command can be read
    expect(await paneTexts(pane)).toContain('Compact: choose what to keep')
    await pane.unmount()
    // a refused fill is not "typed": the menu stays on
    const after = await guardText($, surface)
    expect(after).toContain('Actions ▾')
    expect(after).not.toContain('the box has your text')
  })

  test(`/clear starts the picker over: closed, with the default ticks (${surface})`, async ($, on) => {
    const { r } = await advising($, on, surface)
    let pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    await pane.press({ key: 'sb-guard-tab-pick' })
    await pane.press({ key: 'sb-guard-pk-lean' })
    expect(await paneTexts(pane)).toContain('[ ] Leave out tool output and logs')
    await pane.unmount()
    await $.session.end({ reason: 'clear', sessionId: 'me', resume: { id: 'me' } as never })
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    await pane.press({ key: 'sb-guard-tab-pick' })
    expect(await paneTexts(pane)).toContain('[x] Leave out tool output and logs')
    await pane.unmount()
    expect(r.compacts).toHaveLength(0)
  })

  test(`while a compaction you pressed Enter on runs, the strip says compacting, then shows the result (${surface})`, async ($, on) => {
    let release: () => void = () => undefined
    const gate = new Promise<void>(res => {
      release = res
    })
    const { clock, r } = await advising($, on, surface, { gate, before: 412_000, after: 118_000 })
    const run = $.session.compact({ messages: MSGS, trigger: 'manual' } as never)
    await clock.advance(10)
    expect(await guardText($, surface)).toContain('compacting')
    expect(await guardText($, surface)).toContain('the summary is being written')
    expect(await guardChips($, surface)).toEqual([['#000000', ' ⟳ compacting ', 'magenta']])
    release()
    await run
    await clock.advance(1_000)
    const done = await guardText($, surface)
    expect(await guardChips($, surface)).toEqual([['#000000', ' ✓ compacted ', 'green']])
    expect(done).toContain('compacted')
    expect(done).not.toContain('the summary is being written')
    expect(r.compacts).toHaveLength(1)
  })

  test(`a compaction the engine skips shows why on the chip, and a precompute shows nothing (${surface})`, async ($, on) => {
    const { clock, r } = await advising($, on, surface, { skip: 'nothing to compact' })
    await $.session.compact({ messages: MSGS, trigger: 'manual' } as never)
    await clock.advance(1_000)
    const t = await guardText($, surface)
    expect(t).toContain('compact failed')
    expect(t).toContain('nothing to compact')
    expect(t).toContain('Actions ▾')
    expect(await guardChips($, surface)).toEqual([['#000000', ' ✗ compact failed ', 'red']])
    // a precompute installs nothing, so the chip keeps quiet about it
    r.skip = undefined
    await $.prompt.submit({ text: 'go on', origin: { kind: 'composer' }, wait: false })
    await $.session.compact({ messages: MSGS, trigger: 'precompute' } as never)
    await clock.advance(1_000)
    const after = await guardText($, surface)
    expect(after).not.toContain('the summary is being written')
    expect(after).not.toContain('compacted')
    expect(after).not.toContain('compact failed')
  })

  test(`a compaction that throws shows the failure on the chip and still throws (${surface})`, async ($, on) => {
    const { clock } = await advising($, on, surface, { compactError: 'engine said no' })
    let thrown: unknown
    try {
      await $.session.compact({ messages: MSGS, trigger: 'manual' } as never)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeDefined()
    await clock.advance(1_000)
    const t = await guardText($, surface)
    expect(t).toContain('compact failed')
    // the engine words the error itself (a throwing test handler reaches the plugin as "no implementation"), so only that there is a reason
    expect(t.replace('✗ compact failed', '').trim().length).toBeGreaterThan(0)
  })

  test(`stopped: two compactions that did not shrink the context: red text on black, with the Actions menu (${surface})`, async ($, on) => {
    const { clock } = await advising($, on, surface, { before: 400_000, after: 380_000 })
    await $.session.compact({ messages: MSGS, trigger: 'manual' } as never)
    await $.session.compact({ messages: MSGS, trigger: 'manual' } as never)
    // sending a prompt ends the last compaction's result row; the context then grows past the new advise line
    await $.prompt.submit({ text: 'go on', origin: { kind: 'composer' }, wait: false })
    await $.session.measure(measure(600_000))
    await clock.advance(5_000)
    const t = await guardText($, surface)
    expect(t).toContain('■ stopped')
    expect(t).toContain('Actions ▾')
    expect(await guardChips($, surface)).toEqual([['#000000', ' ■ stopped ', 'red']])
    // the button follows the chip here too, and its menu opens beneath it
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    await band.press({ key: 'sb-guard-menu' })
    expect((await band.find({ key: 'sb-guard-line' }))!.text.indexOf('Actions')).toBe(' ■ stopped '.length + 1)
    expect((await band.find({ key: 'sb-guard-pick' }))!.text.indexOf('▸')).toBe(' ■ stopped '.length + 1)
    await band.unmount()
  })

  test(`THE RULE: no button anywhere calls session.compact; the mod only types (${surface})`, async ($, on) => {
    const { clock, r } = await advising($, on, surface)
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    for (const key of ['sb-guard-pick', 'sb-guard-plain', 'sb-guard-clear']) {
      await band.press({ key: 'sb-guard-menu' })
      await band.press({ key })
    }
    await band.unmount()
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    for (const key of ['sb-guard-tab-pick', 'sb-guard-tab-plain', 'sb-guard-tab-clear', 'sb-guard-pk-notes', 'sb-guard-pk-lean', 'sb-guard-type', 'sb-guard-pick-cancel', 'sb-guard-mode-off', 'sb-guard-mode-advise']) {
      if (await pane.find({ key })) await pane.press({ key })
    }
    await pane.unmount()
    await clock.advance(120_000)
    await $.session.measure(measure(900_000))
    await clock.advance(120_000)
    expect(r.compacts).toHaveLength(0)
    expect(r.fills.length).toBeGreaterThan(0)
    for (const f of r.fills) expect(f.text === '/clear' || f.text.startsWith('/compact')).toBe(true)
  })
}

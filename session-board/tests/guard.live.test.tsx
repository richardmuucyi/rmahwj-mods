import { expect, mock, test } from 'claude-code/testing'

import { DEFAULT_INSTRUCTIONS } from '../hooks/guard'
import { BAND, PANE_PROPS, bottom, guardChips, guardText, measure, rig } from './guard-bottom'

const MIN = 60_000
/** A compaction always holds at least one message: the engine refuses to rewrite an empty one. */
const MSGS = [{ role: 'user', text: 'we edit build_compare.py on :8199', toolUses: [] }]
const REPO = '/home/me/vault'

const toolResults = (_$: unknown, e: { tool: string; file_path?: string }) => {
  if (e.tool === 'Edit') {
    return {
      result: {
        filePath: e.file_path,
        structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-a', '+b', '+c'] }],
        originalFile: 'a',
      },
    }
  }
  return { result: 'ok' }
}

/** One finished turn, optionally running a shell command first. */
async function turn($: any, id: string, run?: { tool: string; args: Record<string, unknown> }) {
  await $.turn.start({ text: 'go', turnId: id })
  if (run) await $.tool.call({ tool: run.tool, ...run.args })
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: id, reason: 'answer' })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`strip: under 200K nothing, from 200K just the Actions button; the size is in the gauge, not here (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    bottom(on, rig())
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await turn($, 't1')
    await $.session.measure(measure(150_000))
    await clock.advance(5_000)
    expect(await guardText($, surface)).toBe('')
    await $.session.measure(measure(212_000))
    await clock.advance(5_000)
    expect(await guardText($, surface)).toBe('Actions ▾')
    // no ctx chip: the row is the plain Actions button, with no black block (the context size is in the usage gauge)
    expect(await guardChips($, surface)).toEqual([])
  })

  test(`strip: from 300K, just committed: the advice and the saving, one Actions menu, no ctx chip (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    bottom(on, rig())
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await turn($, 't1', { tool: 'Bash', args: { command: 'git add -A && git commit -m x' } })
    await $.session.measure(measure(312_000))
    await clock.advance(5_000)
    const t = await guardText($, surface)
    expect(t).toContain('good moment: just committed')
    expect(t).toContain('compacting saves about $0.04 per request')
    // the row starts with the Actions button, and the words follow it
    expect(t).toBe('Actions ▾ good moment: just committed │ compacting saves about $0.04 per request')
    // the ctx number is gone from the row (the gauge's context meter shows it), and no black chip is drawn
    expect(t).not.toContain('ctx')
    expect(await guardChips($, surface)).toEqual([])
    // the advice is a hint, so it is not louder than the CHECK flag. The Actions button is the lighter link blue.
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    expect(JSON.stringify(await band.find({ key: 'sb-guard-menu' }))).toContain('#7AA2F7')
    await band.unmount()
    // the four separate buttons are gone: Compact…, Plain and /clear sit in the menu, and Later is gone
    expect(t).not.toContain('[ Compact… ]')
    expect(t).not.toContain('[ Plain ]')
    expect(t).not.toContain('[ /clear ]')
    expect(t).not.toContain('Later')
    expect(t).not.toContain('Compact now')
    expect(t).not.toContain('Keep going')
  })

  test(`strip: a file of this session is uncommitted: the advice stays, but it is not called a good moment (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    bottom(on, rig({ status: [' M a.md'] }))
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await turn($, 't1', { tool: 'Edit', args: { file_path: `${REPO}/a.md`, old_string: 'a', new_string: 'b' } })
    await $.session.measure(measure(312_000))
    await clock.advance(5_000)
    const t = await guardText($, surface)
    expect(t).not.toContain('ctx')
    expect(t).toContain('Actions ▾')
    expect(t).toContain('ok moment')
    expect(t).not.toContain('good moment')
  })

  test(`strip: a background job does not hold the advice back; the line says it is running (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    bottom(on, rig())
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.agent.spawn({ prompt: 'find', description: 'Scan the vault', subagentType: 'Explore', background: true } as never)
    await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
    await $.session.measure(measure(455_000))
    await clock.advance(5_000)
    const t = await guardText($, surface)
    expect(t).not.toContain('ctx')
    expect(t).toContain('ok moment · 1 job running │ compacting saves about')
    expect(t).toContain('Actions ▾')
    expect(t).not.toContain('held')
    expect(t).not.toContain('Compact anyway')
  })

  test(`strip: two jobs are counted in the plural, and a finished job leaves the line (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    bottom(on, rig())
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.agent.spawn({ prompt: 'find', description: 'Scan the vault', subagentType: 'Explore', background: true } as never)
    await $.agent.spawn({ prompt: 'find', description: 'Scan the inbox', subagentType: 'Explore', background: true } as never)
    await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
    await $.session.measure(measure(455_000))
    await clock.advance(5_000)
    expect(await guardText($, surface)).toContain('· 2 jobs running')
  })

  test(`result row: a /compact you press Enter on is left plain, and the chip then shows its result with the recall (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const r = rig({ before: 412_000, after: 118_000, status: [' M a.md'], summary: 'We edited build_compare.py.' })
    bottom(on, r)
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await turn($, 't1', { tool: 'Edit', args: { file_path: `${REPO}/a.md`, old_string: 'a', new_string: 'b' } })
    await $.session.measure(measure(412_000))
    await clock.advance(5_000)
    // Enter on a /compact: the engine fires session.compact with the trigger `manual`
    await $.session.compact({ messages: MSGS, trigger: 'manual' } as never)
    await clock.advance(1_000)
    expect(r.compacts).toHaveLength(1)
    expect(r.compacts[0]!.instructions).toBeUndefined()
    const after = await guardText($, surface)
    expect(after).toContain('compacted')
    expect(after).toContain('412K → 118K')
    expect(after).toContain('−$0.06 per request')
    expect(after).toContain('recall 50%')
  })

  test(`result row: the engine's own late compaction gets the recipe, and the chip shows its result too (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const r = rig({ before: 760_000, after: 130_000, status: [' M a.md'], summary: 'We edited build_compare.py.' })
    bottom(on, r)
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await turn($, 't1', { tool: 'Edit', args: { file_path: `${REPO}/a.md`, old_string: 'a', new_string: 'b' } })
    await $.session.measure(measure(760_000))
    await clock.advance(5_000)
    await $.session.compact({ messages: MSGS, trigger: 'auto' } as never)
    await clock.advance(1_000)
    const told = r.compacts[0]!
    expect(told.instructions!.startsWith(DEFAULT_INSTRUCTIONS)).toBe(true)
    expect(told.instructions).toContain('Context before compaction: 760K · branch main · last commit 650df709')
    expect(told.instructions).toContain('  - a.md')
    const after = await guardText($, surface)
    expect(after).toContain('compacted')
    expect(after).toContain('760K → 130K')
  })

  test(`no Later and no snooze: the advice stays while the context grows, until you act (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const r = rig()
    bottom(on, r)
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await turn($, 't1', { tool: 'Bash', args: { command: 'git push' } })
    await $.session.measure(measure(312_000))
    await clock.advance(5_000)
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    expect(await band.find({ key: 'sb-guard-later' })).toBeUndefined()
    await band.unmount()
    await turn($, 't2')
    await $.session.measure(measure(330_000))
    await clock.advance(31 * MIN)
    const t = await guardText($, surface)
    expect(t).not.toContain('ctx')
    expect(t).toContain('Actions ▾')
    expect(t).not.toContain('snoozed')
    expect(r.compacts).toHaveLength(0)
  })

  test(`advise mode only offers buttons, even at 700K: nothing compacts and nothing is typed by itself (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const r = rig()
    bottom(on, r)
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await turn($, 't1', { tool: 'Bash', args: { command: 'git push' } })
    await $.session.measure(measure(700_000))
    await clock.advance(30_000)
    const t = await guardText($, surface)
    expect(t).toContain('Actions ▾')
    expect(t).not.toContain('compacting in')
    expect(t).not.toContain('Keep going')
    expect(r.compacts).toHaveLength(0)
    expect(r.fills).toHaveLength(0)
  })

  test(`mode off: no chip at 612K (${surface})`, { options: { mode: 'off' } }, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    bottom(on, rig())
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await turn($, 't1', { tool: 'Bash', args: { command: 'git push' } })
    await $.session.measure(measure(612_000))
    await clock.advance(5_000)
    expect(await guardText($, surface)).toBe('')
    // The same session, switched to advise from the Context tab: now it speaks.
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    await pane.press({ key: 'sb-guard-mode-advise' })
    await pane.unmount()
    expect(await guardText($, surface)).toContain('Actions ▾')
  })

  test(`session.compact: a /compact you press Enter on is never changed; the engine's own late one and a precompute get the recipe (${surface})`, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const r = rig()
    bottom(on, r)
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await $.session.measure(measure(412_000))
    const run = async (e: Record<string, unknown>) => {
      r.compacts.length = 0
      await $.session.compact({ messages: MSGS, ...e } as never)
      return r.compacts[0]!
    }
    // a bare /compact (the Plain button, or typed by hand) is a plain compact: nothing is added
    expect((await run({ trigger: 'manual' })).instructions).toBeUndefined()
    // the words after /compact are yours, whatever they are
    expect((await run({ trigger: 'manual', instructions: 'keep the plan' })).instructions).toBe('keep the plan')
    // the engine at its limit and a precompute: nobody types those, so they get the recipe and the board's facts
    const auto = await run({ trigger: 'auto' })
    expect(auto.instructions!.startsWith(DEFAULT_INSTRUCTIONS)).toBe(true)
    expect(auto.instructions).toContain('Facts from the session board')
    expect((await run({ trigger: 'precompute' })).instructions!.startsWith(DEFAULT_INSTRUCTIONS)).toBe(true)
    // a subagent's or a fork's own compaction is not this session's
    expect((await run({ trigger: 'auto', agentId: 'a9' })).instructions).toBeUndefined()
  })

  test(`session.compact: an instructions file of yours replaces the built-in text (${surface})`, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    const r = rig()
    r.files.set('/home/me/.claude/session-board/compact-instructions.md', 'MY OWN NOTES RULES')
    bottom(on, r)
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await $.session.measure(measure(412_000))
    await $.session.compact({ messages: MSGS, trigger: 'auto' } as never)
    expect(r.compacts[0]!.instructions!.startsWith('MY OWN NOTES RULES')).toBe(true)
    expect(r.compacts[0]!.instructions).toContain('Facts from the session board')
  })

  test(`a compaction the engine or you start moves the floor and starts the cooldown (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const r = rig({ before: 760_000, after: 130_000 })
    bottom(on, r)
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await turn($, 't1', { tool: 'Bash', args: { command: 'git push' } })
    await $.session.measure(measure(760_000))
    await $.session.compact({ messages: MSGS, trigger: 'auto' } as never)
    await turn($, 't2', { tool: 'Bash', args: { command: 'git push' } })
    await $.session.measure(measure(560_000))
    await clock.advance(5_000)
    // you send a prompt, which ends the last compaction's result row
    await $.prompt.submit({ text: 'go on', origin: { kind: 'composer' }, wait: false })
    // 4 minutes after a compaction: cooling, so only the Actions button
    expect(await guardText($, surface)).toBe('Actions ▾')
  })

  test(`Context tab: mode, thresholds, the last compaction with its recall, the instructions file (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const r = rig({ before: 412_000, after: 118_000, history: ['edit build_compare.py, :8199, 0095'], summary: 'We edited build_compare.py for study 0095.' })
    bottom(on, r)
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await turn($, 't1', { tool: 'Bash', args: { command: 'git push' } })
    await $.session.measure(measure(412_000))
    await clock.advance(5_000)
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    const texts = async () => (await pane.findAll({ type: 'Text' })).map(x => x.text.replace(/\s+/g, ' ').trim()).join(' | ')
    let t = await texts()
    expect(r.compacts).toHaveLength(0)
    expect(t).toContain('Context 412K')
    expect(t).toContain('advise from 300K')
    expect(t).toContain('Advise')
    expect(t).toContain('Off')
    expect(t).not.toContain('Auto')
    expect(t).not.toContain('veto')
    expect(t).not.toContain('countdown')
    expect(t).not.toContain('Compact now')
    expect(t).toContain('now → after: 412K → about 120K')
    expect(t).toContain('saves about $0.06 per request')
    expect(t).toContain('Last compactions')
    expect(t).toContain('none yet')
    expect(t).toContain('compact-instructions.md')
    // you press Enter on a /compact: the history takes it in
    await $.session.compact({ messages: [{ role: 'user', text: 'edit build_compare.py, :8199, 0095', toolUses: [] }], trigger: 'manual' } as never)
    await clock.advance(1_000)
    t = await texts()
    expect(t).toContain('412K → 118K')
    expect(t).toContain('recall 67%')
    expect(t).toContain('missing: 8199')
    expect(t).toContain('manual')
    await pane.unmount()
  })

  test(`Context tab: the mode buttons switch the mode and keep it for the next session (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const r = rig()
    bottom(on, r)
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    expect(await pane.find({ key: 'sb-guard-mode-auto' })).toBeUndefined()
    await pane.press({ key: 'sb-guard-mode-off' })
    expect(r.store.get('guard.mode')).toBe('off')
    await pane.unmount()
    await turn($, 't1', { tool: 'Bash', args: { command: 'git commit -m done' } })
    await $.session.measure(measure(512_000))
    expect(await guardText($, surface)).toBe('')
  })

  test(`a mode kept from an earlier session is used at start (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const r = rig()
    r.store.set('guard.mode', 'off')
    bottom(on, r)
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await turn($, 't1', { tool: 'Bash', args: { command: 'git push' } })
    await $.session.measure(measure(612_000))
    await clock.advance(5_000)
    expect(await guardText($, surface)).toBe('')
    // The stored 'off' won over the default 'advise': switching shows the chip was only held back by the mode.
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    await pane.press({ key: 'sb-guard-mode-advise' })
    await pane.unmount()
    expect(r.store.get('guard.mode')).toBe('advise')
    expect(await guardText($, surface)).toContain('Actions ▾')
  })

  test(`a mode \`auto\` kept by an older version reads as advise, and a kept countdown length is ignored (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const r = rig()
    r.store.set('guard.mode', 'auto')
    r.store.set('guard.veto', 120)
    bottom(on, r)
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await turn($, 't1', { tool: 'Bash', args: { command: 'git commit -m done' } })
    await $.session.measure(measure(512_000))
    await clock.advance(30_000)
    const t = await guardText($, surface)
    expect(t).toContain('Actions ▾')
    expect(t).not.toContain('compacting in')
    expect(r.compacts).toHaveLength(0)
    expect(r.fills).toHaveLength(0)
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS } as never)
    await pane.press({ key: 'sb-tab-context' })
    const texts = (await pane.findAll({ type: 'Text' })).map(x => x.text.replace(/\s+/g, ' ').trim()).join(' | ')
    expect(texts).not.toContain('Auto')
    await pane.unmount()
  })

  test(`a narrow terminal gets the Actions button alone (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    bottom(on, rig())
    on('tool.call', toolResults)
    await $.session.start({ cwd: REPO, surface, isInteractive: true })
    await turn($, 't1', { tool: 'Bash', args: { command: 'git push' } })
    await $.session.measure(measure(312_000))
    await clock.advance(5_000)
    const t = await guardText($, surface, { bodyColumns: 50 })
    expect(t).toBe('Actions ▾')
    expect(t).not.toContain('per request')
    expect(t).not.toContain('Plain')
  })
}

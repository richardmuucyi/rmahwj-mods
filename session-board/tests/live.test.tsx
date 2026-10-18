import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

/** On Windows the engine turns /home/me/x into C:\home\me\x. The tests keep POSIX paths, so a test reads the same on both. */
const posix = (p: string) => p.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/')

const PANE_PROPS = {
  title: 'Sessions',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 80 },
  view: {},
}
const BAND = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

/** A git repository in memory: what status, numstat and diff answer. */
type Repo = { isRepo: boolean; status: string[]; numstat: string[]; runs: string[][]; logDirs?: string[] }

const openSawView: string[] = []

/** The coloured blocks of a drawn element, left to right: [background, text, text colour]. */
function chipsOf(node: unknown, out: [string, string, string][] = []): [string, string, string][] {
  const n = node as { props?: { backgroundColor?: string; color?: string }; children?: unknown[] } | string | undefined
  if (n === undefined || typeof n === 'string') return out
  if (n.props?.backgroundColor) out.push([n.props.backgroundColor, (n.children ?? []).filter(c => typeof c === 'string').join(''), n.props.color ?? ''])
  else for (const c of n.children ?? []) chipsOf(c, out)
  return out
}

function bottom(on: On, files: Map<string, string>, repo: Repo) {
  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('session.id', () => ({ value: 'me' }))
  on('session.root', () => ({ value: '/home/me/vault' }))
  on('fs.write', (_$, e) => {
    files.set(posix(e.path), e.text)
    return { value: undefined }
  })
  on('fs.read', (_$, e) => {
    const text = files.get(posix(e.path))
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.list', (_$, e) => ({
    value: posix(e.path) === '/home/me/.claude/session-board/log' && repo.logDirs
      ? repo.logDirs.map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false }))
      : [...files.keys()]
      .filter(k => k.startsWith(`${posix(e.path)}/`))
      .map(k => ({ name: k.slice(posix(e.path).length + 1), kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })),
  }))
  on('ui.status', () => ({ value: undefined }))
  // Which tab the panel was on when it was asked to open: a press must open the panel first, before
  // its own awaits, or the engine counts the open as unasked (a window under 144 columns: undrawn).
  let tab = 'board'
  on('state.set', (_$, e, next) => {
    const ev = e as unknown as { plugin: string; key: string; value?: { view?: string } }
    if (ev.plugin === 'session-board' && ev.key === 'files') tab = ev.value?.view ?? tab
    return next(e)
  })
  on('ui.open', () => {
    openSawView.push(tab)
    return { value: { isPlaced: true } as never }
  })
  on('agent.list', () => ({ value: [] }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key="engine-own">
        <Text>engine</Text>
      </Box>
    )
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('classic.Stop', () => ({}))
  on('classic.SubagentStop', () => ({}))
  on('classic.PermissionRequest', () => ({}))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as never, usage: null }
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: 'a1' }))
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    repo.runs.push(argv)
    const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (!repo.isRepo) return out('', 128)
    const args = argv.filter(a => a !== '-c' && a !== 'core.quotepath=off').slice(1)
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return out('/home/me/vault\n')
    if (args[0] === 'rev-parse') return out('abc123\n')
    if (args[0] === 'status') return out(repo.status.map(s => `${s}\0`).join(''))
    if (args[0] === 'diff' && args.includes('--numstat')) return out(repo.numstat.map(s => `${s}\0`).join(''))
    if (args[0] === 'diff' && args.includes('gone.md')) return out('diff --git a/gone.md b/gone.md\ndeleted file mode 100644\n--- a/gone.md\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-first\n-second\n')
    return out('')
  })
}

async function step($: Engine, e: { turnId: string; index: number; model: string; agentId?: string }) {
  const s = $.turn.step({ ...e, messageCount: 1 })
  for await (const _ of s) {
    // drain
  }
}

const texts = async (m: { findAll: (q: { type: 'Text' }) => Promise<{ text: string }[]> }) =>
  (await m.findAll({ type: 'Text' })).map(x => x.text.replace(/\s+/g, ' ').trim())

for (const surface of ['terminal', 'desktop'] as const) {
  test(`this session: subagents with their model, task bar, files changed (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const files = new Map<string, string>()
    const repo: Repo = { isRepo: true, status: [' M notes/old.md'], numstat: ['1\t1\tnotes/old.md'], runs: [] }
    bottom(on, files, repo)
    on('tool.call', (_$, e) => {
      switch (e.tool) {
        case 'TaskCreate':
          return { result: { task: { id: String(e.subject).slice(0, 1), subject: e.subject } } }
        case 'Write':
          return { result: { type: 'create', filePath: e.file_path, content: 'a\nb\n', structuredPatch: [], originalFile: null } }
        case 'Edit':
          return {
            result: {
              filePath: e.file_path,
              structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-a', '+b', '+c'] }],
              originalFile: 'a',
            },
          }
        default:
          return { result: 'ok' }
      }
    })

    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })
    await clock.advance(5_000)
    await $.prompt.submit({ text: 'Build it', origin: { kind: 'composer' }, wait: false })
    await $.turn.start({ text: 'Build it', turnId: 't1' })
    await step($, { turnId: 't1', index: 0, model: 'claude-opus-4-1-20250805' })
    await $.tool.call({ tool: 'TaskCreate', subject: '1 Plan', description: '' })
    await $.tool.call({ tool: 'TaskCreate', subject: '2 Test', description: '', activeForm: 'Running tests' })
    await $.tool.call({ tool: 'TaskCreate', subject: '3 Ship', description: '' })
    await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
    await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' })
    // A subagent: its model resolved at spawn, its activity from its own tool calls.
    await $.agent.spawn({ prompt: 'find', description: 'Find the config files', subagentType: 'Explore' })
    await step($, { turnId: 't1-a1', index: 0, model: 'claude-haiku-4-5-20251001', agentId: 'a1' })
    await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'a1' })
    await $.tool.call({ tool: 'Write', file_path: '/home/me/vault/src/new.ts', content: 'a\nb\n' })
    await $.tool.call({ tool: 'Edit', file_path: '/home/me/vault/hooks/register.tsx', old_string: 'a', new_string: 'b\nc' })
    // A shell delete and the files above, as git sees them.
    repo.status = [' M notes/old.md', '?? src/new.ts', ' M hooks/register.tsx', ' D gone.md']
    repo.numstat = ['1\t1\tnotes/old.md', '2\t1\thooks/register.tsx', '0\t2\tgone.md']
    await clock.advance(5_000)

    // The strip while it works: task bar, what it is on, subagents, files.
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    const row = await band.find({ key: 'sb-live' })
    expect(row?.text.replace(/\s+/g, ' ').trim()).toBe('▰▰▰▱▱▱▱▱▱▱ 1/3 Running tests │ ◈ Explore · haiku │ ✎ 2 files ›')
    expect(await band.find({ key: 'engine-own' })).toBeDefined()
    await band.unmount()

    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS })
    let t = await texts(pane)
    expect(t).toContain('THIS SESSION')
    expect(t.some(x => x === 'opus-4-1')).toBe(true)
    expect(t.some(x => /SUBAGENTS · 1 running/.test(x))).toBe(true)
    expect(t.some(x => /◔ Explore · haiku-4-5 · \d+s/.test(x))).toBe(true)
    expect(t.some(x => /Find the config files/.test(x))).toBe(true)
    expect(t.some(x => /→ Searching files/.test(x))).toBe(true)
    expect(t.some(x => /1\/3 tasks/.test(x))).toBe(true)

    // The subagent ends; the turn ends; git's view of the turn is taken.
    await $.classic.SubagentStop({ agent_id: 'a1', agent_type: 'Explore', stop_hook_active: false } as never)
    await $.classic.Stop({ stop_hook_active: false, background_tasks: [], session_crons: [] })
    await $.turn.complete({ answer: 'Done.', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' })
    await clock.advance(5_000)
    t = await texts(pane)
    expect(t.some(x => /✓ Explore · haiku-4-5 · done/.test(x))).toBe(true)
    // No strip row once the turn is over.
    const band2 = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    expect(await band2.find({ key: 'sb-live' })).toBeUndefined()
    await band2.unmount()

    // The files view: Claude's edits plus what only git saw; old.md was dirty before the turn.
    await pane.press({ key: 'sb-files-open' })
    await clock.advance(1_000)
    t = await texts(pane)
    expect(t).toContain('+ src/new.ts +2 ■■■■■ ▸')
    expect(t).toContain('~ hooks/register.tsx +2 −1 ■■■■■ ▸')
    expect(t).toContain('− gone.md deleted · 2 lines ▸')
    expect(t.some(x => /old\.md/.test(x))).toBe(false)
    // Claude's own diff lines for its edit; git's diff for the shell delete.
    await pane.press({ key: 'sb-file-btn-/home/me/vault/hooks/register.tsx' })
    t = await texts(pane)
    expect(t).toContain("Claude's edits")
    expect(t).toContain('+ b')
    expect(t).toContain('@@ line 1')
    expect(t).toContain('1 − a')
    expect(t).toContain('− a')
    await pane.press({ key: 'sb-file-btn-/home/me/vault/gone.md' })
    t = await texts(pane)
    expect(t).toContain('git diff against the last commit')
    expect(t).toContain('− second')
    // The whole session: from the session's start (old.md was dirty already then).
    await pane.press({ key: 'sb-files-tab-session' })
    t = await texts(pane)
    expect(t.some(x => /src\/new\.ts/.test(x))).toBe(true)
    // Back to the board.
    await pane.press({ key: 'sb-tab-board' })
    t = await texts(pane)
    expect(t).toContain('THIS SESSION')
    await pane.unmount()

    // The card others read carries the task counts.
    const card = JSON.parse(files.get('/home/me/.claude/session-board/me.json') ?? '{}') as { progress?: unknown; v?: number }
    expect(card.progress).toEqual({ done: 1, total: 3 })
    expect(card.v).toBe(3)

    // Next turn: its own files list; ended subagents drop off.
    await $.turn.start({ text: 'More', turnId: 't2' })
    await clock.advance(5_000)
    const pane2 = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS })
    await pane2.press({ key: 'sb-tab-board' }).catch(() => undefined)
    t = await texts(pane2)
    expect(t.some(x => /SUBAGENTS/.test(x))).toBe(false)
    await pane2.unmount()
  })

  test(`turns: Claude's summary line, the recap row, the Turns tab (${surface})`, { options: { journal: true } }, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const files = new Map<string, string>()
    const repo: Repo = { isRepo: false, status: [], numstat: [], runs: [] }
    bottom(on, files, repo)
    let guidance = ''
    let box = ''
    on('prompt.compose', () => ({ sections: [] }))
    on('prompt.fill', (_$, e) => {
      box = e.text
      return { ...e, isFilled: true }
    })
    on('tool.call', (_$, e) =>
      e.tool === 'Edit'
        ? { result: { filePath: e.file_path, structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-x', '+y'] }], originalFile: 'x' } }
        : { result: 'ok' },
    )
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })
    const composed = await $.prompt.compose({ model: 'claude-opus-4-1', promptModel: 'claude-opus-4-1', surfaces: [surface], tools: [], outputStyle: null, traits: [] } as never)
    guidance = composed.sections.map(x => x.text).join('\n')
    expect(guidance).toContain('Turn: <what you did')

    await $.prompt.submit({ text: 'Fix the login test', origin: { kind: 'composer' }, wait: false })
    await $.turn.start({ text: 'Fix the login test', turnId: 't1' })
    await step($, { turnId: 't1', index: 0, model: 'claude-opus-4-1-20250805' })
    await $.tool.call({ tool: 'Read', file_path: '/home/me/vault/a.ts' })
    await $.tool.call({ tool: 'Read', file_path: '/home/me/vault/b.ts' })
    await $.tool.call({ tool: 'Edit', file_path: '/home/me/vault/jest.config.js', old_string: 'x', new_string: 'y' })
    await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests' })
    await $.tool.call({ tool: 'mcp__assumptions__log_assumption', assumption: 'Jest v29 is the target', impact: 'high' } as never)
    await clock.advance(1_000)
    // The assumptions mod reports one still open.
    files.set('/home/me/.claude/session-board/me.assume', JSON.stringify({ open: 1, high: 1 }))
    await $.classic.Stop({ stop_hook_active: false, background_tasks: [], session_crons: [] })
    await $.turn.complete({
      answer: 'Done.\n\nTurn: Fixed the login test · check: mock order in jest.config.js',
      durationMs: 180_000, isAborted: false, turnId: 't1', reason: 'answer',
    })
    files.set('/home/me/.claude/session-board/far.json', JSON.stringify({
      changedAt: 1_000_000, seenAt: 1_000_000, id: 'far', folder: '/home/me/iams-ups', project: 'iams-ups',
      asked: 'Fix the deploy script', status: 'needs-you', activity: 'Approve: Run the deploy',
    }))
    await clock.advance(5_000)

    // The check and the review chip sit in the "this session" row, beside its pill, before the others.
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
    const row = (await band.find({ key: 'sb-strip' }))?.text.replace(/\s+/g, ' ').trim()
    expect(row).toBe('current ✓ Done ⚑ CHECK mock order in jest.config.js ⚠ 1 to review ↓ │ others ? iams-ups sessions ›')
    // The label chips touch their pills (only the two paddings between them: no gap), the flag touches the status
    // pill, and no pipe divides the groups. The whitespace-folded text above cannot show a gap.
    const drawn = await band.find({ key: 'sb-strip' })
    const raw = drawn?.text ?? ''
    expect(raw).toContain('current   ✓ Done')
    expect(raw).not.toContain('current    ')
    // the status glyph is in cell 11, the same cell as the Actions button of the context row
    expect(raw.indexOf('✓')).toBe(11)
    expect(raw).toContain('✓ Done  ⚑ CHECK')
    expect(raw).not.toContain('Done   ')
    expect(raw).toContain('↓  │  others')
    expect(chipsOf(drawn)).toEqual([
      ['#000000', ' current  ', '#8B949E'], ['#000000', ' ✓ Done ', 'green'], ['yellow', ' ⚑ CHECK ', 'black'], ['yellow', ' ⚠ 1 to review ↓ ', 'black'],
      ['#000000', ' others ', '#8B949E'], ['#000000', ' ? iams-ups ', 'yellow'],
    ])
    // Not repeated: Claude's summary, the turn's duration, the file counts, a second link.
    expect(row).not.toContain('Fixed the login test')
    expect(row).not.toContain('3m')
    expect(row).not.toContain('~1')
    expect(row).not.toContain('turn ›')
    expect(await band.find({ key: 'sb-recap-open' })).toBeUndefined()
    // The panel link is the one way in.
    const opens = openSawView.length
    await band.press({ key: 'sb-strip-open' })
    expect(openSawView.length).toBe(opens + 1)
    await band.unmount()
    // No other session open: the row still shows, with the check and the link.
    files.delete('/home/me/.claude/session-board/far.json')
    await clock.advance(5_000)
    const alone = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
    expect((await alone.find({ key: 'sb-strip' }))?.text.replace(/\s+/g, ' ').trim())
      .toBe('current ✓ Done ⚑ CHECK mock order in jest.config.js ⚠ 1 to review ↓ sessions ›')
    await alone.unmount()
    // A narrow strip: icons only, and the check in full on a row of its own.
    const narrow = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: { ...BAND, isWorking: false, bodyColumns: 40 } })
    expect((await narrow.find({ key: 'sb-recap-row' }))?.text.replace(/\s+/g, ' ').trim()).toBe('⚑ CHECK mock order in jest.config.js ⚠ 1 to review ↓')
    expect(await narrow.find({ key: 'sb-strip' })).toBeDefined()
    await narrow.unmount()

    // The Turns tab: the latest turn as a card.
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS })
    await pane.press({ key: 'sb-tab-turns' })
    let t = await texts(pane)
    expect(t.some(x => /● LATEST/.test(x))).toBe(true)
    expect(t).toContain('Fixed the login test')
    expect(t.some(x => /⚑ CHECK mock order in jest\.config\.js/.test(x))).toBe(true)
    expect(t.some(x => /TOOLS · 4/.test(x))).toBe(true)
    expect(t.some(x => /read 2/.test(x) && /edit 1/.test(x) && /test 1/.test(x))).toBe(true)
    expect(t.some(x => /ASSUMED · 1/.test(x))).toBe(true)
    expect(t.some(x => /HIGH Jest v29 is the target/.test(x))).toBe(true)
    expect(t.some(x => /✓ answered/.test(x))).toBe(true)
    // 📓 fills the prompt box with a journal-capture line; nothing is written to the vault.
    await pane.press({ key: 'sb-turn-journal-t1' })
    expect(box).toBe('done Fixed the login test')
    // The day's log: one line for the turn, no prompt text, no file names.
    const logKey = [...files.keys()].find(k => /\/session-board\/log\/\d{4}-\d{2}-\d{2}\/me\.jsonl$/.test(k))
    expect(logKey).toBeDefined()
    const logged = JSON.parse(files.get(logKey!)!.trim()) as Record<string, unknown>
    expect(logged).toMatchObject({ project: 'vault', did: 'Fixed the login test', check: 'mock order in jest.config.js', files: 1, assumed: 1, status: 'answered' })
    expect(files.get(logKey!)).not.toContain('Fix the login test')
    expect(files.get(logKey!)).not.toContain('/home/me/vault/')
    // Shown as logged: the card's 📓 and today's count in the header.
    t = await texts(pane)
    expect(t.some(x => /✓ answered 📓/.test(x))).toBe(true)
    expect(t).toContain('📓 1 today')

    // Your next prompt clears the recap; a second turn folds the first into EARLIER.
    await $.prompt.submit({ text: 'Thanks, now the docs', origin: { kind: 'composer' }, wait: false })
    files.set('/home/me/.claude/session-board/me.assume', JSON.stringify({ open: 0, high: 0 }))
    await $.turn.start({ text: 'Thanks, now the docs', turnId: 't2' })
    await $.turn.complete({ answer: 'Sure, no tools needed.', durationMs: 4_000, isAborted: false, turnId: 't2', reason: 'answer' })
    await clock.advance(5_000)
    const band2 = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
    // The next prompt cleared the recap: the check is gone from the row and from the narrow strip.
    expect((await band2.find({ key: 'sb-strip' }))?.text ?? '').not.toContain('⚑ CHECK')
    expect(await band2.find({ key: 'sb-recap-row' })).toBeUndefined()
    // A chat-only turn is not logged.
    expect(files.get(logKey!)!.trim().split('\n')).toHaveLength(1)
    await band2.unmount()
    t = await texts(pane)
    expect(t.some(x => /EARLIER/.test(x))).toBe(true)
    expect(t.some(x => /No summary line from Claude/.test(x))).toBe(true)
    await pane.press({ key: 'sb-turn-toggle-t1' })
    t = await texts(pane)
    expect(t.filter(x => x === 'Fixed the login test').length).toBeGreaterThan(0)
    await pane.unmount()
  })

  test(`outside a git folder only Claude's own edits are listed, and it says so (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const files = new Map<string, string>()
    const repo: Repo = { isRepo: false, status: [], numstat: [], runs: [] }
    bottom(on, files, repo)
    on('tool.call', (_$, e) =>
      e.tool === 'TodoWrite'
        ? { result: 'ok' }
        : { result: { filePath: e.file_path, structuredPatch: [{ oldStart: 3, oldLines: 1, newStart: 3, newLines: 1, lines: ['-x', '+y'] }], originalFile: 'x' } },
    )
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })
    await $.turn.start({ text: 'Fix', turnId: 't1' })
    await $.tool.call({
      tool: 'TodoWrite',
      todos: [
        { content: 'One', status: 'completed', activeForm: 'Doing one' },
        { content: 'Two', status: 'in_progress', activeForm: 'Doing two' },
      ],
    })
    await $.tool.call({ tool: 'Edit', file_path: '/home/me/vault/a.md', old_string: 'x', new_string: 'y' })
    await clock.advance(5_000)
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: BAND })
    expect((await band.find({ key: 'sb-live' }))?.text.replace(/\s+/g, ' ').trim()).toBe('▰▰▰▰▰▱▱▱▱▱ 1/2 Doing two │ ✎ 1 file ›')
    await band.press({ key: 'sb-live-files' })
    expect(openSawView.at(-1)).not.toBe('files')
    await band.unmount()
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS })
    const t = await texts(pane)
    expect(t).toContain('~ a.md +1 −1 ■■■■■ ▸')
    expect(t.some(x => /Not a git folder/.test(x))).toBe(true)
    await pane.unmount()
    // The journal setting is off by default: no log is kept.
    await $.turn.complete({ answer: 'Turn: Fixed a.md', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' })
    expect([...files.keys()].some(k => k.includes('/log/'))).toBe(false)
    const off = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS })
    await off.press({ key: 'sb-tab-turns' })
    expect((await texts(off)).some(x => /📓/.test(x))).toBe(false)
    await off.unmount()
  })

  test(`files: big folders fold, a new file shows its first lines only (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const files = new Map<string, string>()
    const repo: Repo = { isRepo: false, status: [], numstat: [], runs: [] }
    bottom(on, files, repo)
    const body = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')
    on('tool.call', (_$, e) => ({ result: { type: 'create', filePath: e.file_path, content: body, structuredPatch: [], originalFile: null } }))
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })
    await $.turn.start({ text: 'Scratch', turnId: 't1' })
    for (let i = 1; i <= 10; i++) await $.tool.call({ tool: 'Write', file_path: `/home/me/vault/scratchpad/p${i}.py`, content: body })
    await $.tool.call({ tool: 'Write', file_path: '/home/me/vault/README.md', content: body })
    await clock.advance(5_000)
    const pane = await $.ui.mount({ plugin: 'session-board', surface, component: 'Pane', requestId: 'session-board', props: PANE_PROPS })
    await pane.press({ key: 'sb-tab-files' })
    let t = await texts(pane)
    expect(t).toContain('+11 added')
    expect(t).toContain('+220 lines')
    // Ten files in one folder: folded to one row; the lone file shows its full path.
    expect(t).toContain('▸ scratchpad/ +200 · 10 files · open ›')
    expect(t.some(x => /p3\.py/.test(x))).toBe(false)
    expect(t).toContain('+ README.md +20 ■■■■■ ▸')
    await pane.press({ key: 'sb-folder-btn-scratchpad/' })
    t = await texts(pane)
    expect(t.some(x => /└ \+ p\d+\.py \+20/.test(x))).toBe(true)
    // A new file: its first 12 lines, numbered, then a count of the rest.
    await pane.press({ key: 'sb-file-btn-/home/me/vault/readme.md' })
    t = await texts(pane)
    expect(t).toContain('12 + line 12')
    expect(t.some(x => /line 13/.test(x))).toBe(false)
    expect(t).toContain('… 8 more lines · new file')
    await pane.unmount()
  })

  test(`this session's background agents: counted in the strip, nothing when none (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const files = new Map<string, string>()
    const repo: Repo = { isRepo: false, status: [], numstat: [], runs: [] }
    bottom(on, files, repo)
    on('tool.call', () => ({ result: 'ok' }))
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })
    await $.turn.start({ text: 'Go', turnId: 't1' })
    await clock.advance(5_000)
    const strip = async () => {
      const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
      const s = (await band.find({ key: 'sb-strip' }))?.text.replace(/\s+/g, ' ').trim() ?? ''
      await band.unmount()
      return s
    }
    // No other sessions, no background agents: no strip.
    expect(await strip()).toBe('')
    // A background agent: the strip shows this session with the count.
    await $.agent.spawn({ prompt: 'find', description: 'Scan the vault', subagentType: 'Explore', background: true } as never)
    await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
    await clock.advance(5_000)
    expect(await strip()).toBe('current ◌ Waiting on a background task ◈ 1 agent sessions ›')
    // The status and the background count are chips on the labels' black (their colour is the text), and they touch.
    const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
    const drawn = await band.find({ key: 'sb-strip' })
    expect(chipsOf(drawn)).toEqual([
      ['#000000', ' current  ', '#8B949E'], ['#000000', ' ◌ Waiting on a background task ', 'magenta'], ['#000000', ' ◈ 1 agent ', 'magenta'],
    ])
    expect(drawn?.text).toContain('task  ◈ 1 agent')
    await band.unmount()
    // It ends: the count goes, and so does the strip.
    await $.classic.SubagentStop({ agent_id: 'a1', agent_type: 'Explore', stop_hook_active: false } as never)
    await clock.advance(5_000)
    expect(await strip()).toBe('')
  })

  test(`a background shell beside an agent: the chip counts both, like the label does (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const files = new Map<string, string>()
    const repo: Repo = { isRepo: false, status: [], numstat: [], runs: [] }
    bottom(on, files, repo)
    on('tool.call', () => ({ result: 'ok' }))
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })
    await $.turn.start({ text: 'Go', turnId: 't1' })
    await clock.advance(5_000)
    const strip = async () => {
      const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
      const s = (await band.find({ key: 'sb-strip' }))?.text.replace(/\s+/g, ' ').trim() ?? ''
      await band.unmount()
      return s
    }
    // One background agent and one background shell: the strip opens for the agent, and the chip counts each, as the label does.
    await $.agent.spawn({ prompt: 'find', description: 'Scan the vault', subagentType: 'Explore', background: true } as never)
    await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
    await $.classic.Stop({
      stop_hook_active: false,
      background_tasks: [
        { id: 'a1', type: 'subagent', status: 'running', description: 'Scan the vault' },
        { id: 's1', type: 'shell', status: 'running', description: 'npm run dev' },
      ],
    })
    await clock.advance(5_000)
    expect(await strip()).toBe('current ◌ Waiting on 2 background tasks ◈ 1 job · 1 agent sessions ›')
    // The agent ends: nothing but a shell is left, and a shell alone opens no strip.
    await $.classic.SubagentStop({ agent_id: 'a1', agent_type: 'Explore', stop_hook_active: false } as never)
    await clock.advance(5_000)
    expect(await strip()).toBe('')
  })

  test(`the ◈ chip counts jobs, agents, monitors and wake-ups apart; initials when narrow (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const files = new Map<string, string>()
    const repo: Repo = { isRepo: false, status: [], numstat: [], runs: [] }
    bottom(on, files, repo)
    on('tool.call', () => ({ result: 'ok' }))
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })
    await $.turn.start({ text: 'Go', turnId: 't1' })
    await clock.advance(5_000)
    const chip = async (bodyColumns: number) => {
      const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: { ...BAND, bodyColumns, isWorking: false } })
      const drawn = await band.find({ key: 'sb-strip' })
      await band.unmount()
      return chipsOf(drawn).map(c => c[1].trim()).find(t => t.startsWith('◈')) ?? ''
    }
    // A background agent keeps the strip open; two background shells, a monitor and a one-shot wake-up beside it.
    await $.agent.spawn({ prompt: 'find', description: 'Scan the vault', subagentType: 'Explore', background: true } as never)
    await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
    await $.classic.Stop({
      stop_hook_active: false,
      background_tasks: [
        { id: 'a1', type: 'subagent', status: 'running', description: 'Scan the vault' },
        { id: 's1', type: 'shell', status: 'running', description: 'Render on the GPU' },
        { id: 's2', type: 'shell', status: 'running', description: 'npm run dev' },
        { id: 'm1', type: 'monitor', status: 'running', description: 'Watch the render log' },
      ],
      session_crons: [{ id: 'c1', prompt: 'check the render', recurring: false }],
    } as never)
    await clock.advance(5_000)
    expect(await chip(BAND.bodyColumns)).toBe('◈ 2 jobs · 1 agent · 1 monitor · 1 wake-up')
    expect(await chip(50)).toBe('◈2j 1a 1m 1w')
    // A type this version does not know is a plain task, not a job or a monitor.
    await $.classic.Stop({
      stop_hook_active: false,
      background_tasks: [
        { id: 'a1', type: 'subagent', status: 'running', description: 'Scan the vault' },
        { id: 'r1', type: 'remote_agent', status: 'running', description: 'Review in the cloud' },
      ],
    } as never)
    await clock.advance(5_000)
    expect(await chip(BAND.bodyColumns)).toBe('◈ 1 agent · 1 task')
  })

  test(`journal on: log day folders past 30 days are removed, nothing else (${surface})`, { options: { journal: true } }, async ($, on) => {
    mock.clock(on, { now: Date.parse('2026-10-12T09:00:00') })
    const files = new Map<string, string>()
    const repo: Repo = { isRepo: false, status: [], numstat: [], runs: [], logDirs: ['2026-08-01', '2026-09-20', 'notes', '2026-10-12'] }
    bottom(on, files, repo)
    await $.session.start({ cwd: '/home/me/vault', surface, isInteractive: true })
    const removed = repo.runs.filter(r => r[0] === 'rm')
    expect(removed).toEqual([['rm', '-rf', '--', '/home/me/.claude/session-board/log/2026-08-01']])
  })
}

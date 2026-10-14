// The engine beneath the plugin for the guard's live tests: a shared folder and a store in memory, a git
// repository that answers status, branch and last commit, and a compaction that records what it was told.
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

export type Rig = {
  files: Map<string, string>
  store: Map<string, unknown>
  /** git status lines, e.g. ' M notes/a.md' */
  status: string[]
  /** What each compaction was asked, newest last. */
  compacts: { trigger: string; instructions?: string }[]
  /** What the compaction answers. */
  after: number
  before: number
  /** Texts the conversation holds before a compaction (for recall) and the summary it is replaced by. */
  history: string[]
  summary: string
  /** Refuse every write under .../guard/ (a full disk, a locked folder). */
  denyGuard: boolean
  /** Writes under .../guard/ the rig refused, so a test can tell an attempt from no attempt. */
  denied: string[]
  /** Every command the plugin ran through process.run, newest last. */
  runs: string[][]
  /** Day folders the rig reports under .../session-board/guard. */
  guardDirs?: string[]
}

export const rig = (over: Partial<Rig> = {}): Rig => ({
  files: new Map(),
  store: new Map(),
  status: [],
  compacts: [],
  after: 118_000,
  before: 412_000,
  history: [],
  summary: 'We were working.',
  denyGuard: false,
  denied: [],
  runs: [],
  ...over,
})

export const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

export const PANE_PROPS = {
  title: 'Sessions',
  isFocused: false,
  bodyColumns: 100,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

export const measure = (tokens: number) =>
  ({ context: { window: 1_000_000, tokens, percent: Math.round(tokens / 10_000) }, rateLimits: [], changed: ['context'] }) as never

/** On Windows the engine turns /home/me/x into C:\home\me\x. The rig keeps POSIX paths, so a test reads the same on both. */
const posix = (p: string) => p.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/')

export function bottom(on: On, r: Rig) {
  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('session.id', () => ({ value: 'me' }))
  on('session.root', () => ({ value: '/home/me/vault' }))
  on('fs.write', (_$, e) => {
    if (r.denyGuard && posix(e.path).includes('/guard/')) {
      r.denied.push(posix(e.path))
      return { deny: 'EACCES' }
    }
    r.files.set(posix(e.path), e.text)
    return { value: undefined }
  })
  on('fs.read', (_$, e) => {
    const text = r.files.get(posix(e.path))
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.list', (_$, e) => ({
    value: posix(e.path) === '/home/me/.claude/session-board/guard' && r.guardDirs
      ? r.guardDirs.map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false }))
      : [...r.files.keys()]
      .filter(k => k.startsWith(`${posix(e.path)}/`))
      .map(k => ({ name: k.slice(posix(e.path).length + 1), kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })),
  }))
  on('store.get', (_$, e) => ({ value: r.store.get(e.key) }))
  on('store.set', (_$, e) => {
    r.store.set(e.key, e.value)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } as never }))
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
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.messages', () => ({ value: r.history.map(text => ({ role: 'user' as const, text, toolUses: [] })) as never }))
  on('session.compact', (_$, e) => {
    r.compacts.push({ trigger: e.trigger, instructions: e.instructions })
    return {
      messages: [{ role: 'user' as const, text: r.summary, toolUses: [] }],
      tokensBefore: r.before,
      tokensAfter: r.after,
    } as never
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('prompt.edit', (_$, e) => ({ text: e.text, cursor: e.cursor }))
  on('classic.Stop', () => ({}))
  on('classic.SubagentStop', () => ({}))
  on('classic.PermissionRequest', () => ({}))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as never, usage: null }
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: 'a1' }))
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    r.runs.push(argv)
    const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    const args = argv.filter(a => a !== '-c' && a !== 'core.quotepath=off').slice(1)
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return out('/home/me/vault\n')
    if (args[0] === 'rev-parse' && args.includes('--abbrev-ref')) return out('main\n')
    if (args[0] === 'rev-parse') return out('abc123\n')
    if (args[0] === 'log') return out('650df709\n')
    if (args[0] === 'status') return out(r.status.map(s => `${s}\0`).join(''))
    if (args[0] === 'diff' && args.includes('--numstat')) return out('')
    return out('')
  })
}

/** What the guard row says, whitespace folded; '' when it is not drawn. */
export async function guardText($: Engine, surface: 'terminal' | 'desktop', props: Partial<typeof BAND> = {}): Promise<string> {
  const band = await $.ui.mount({ plugin: 'session-board', surface, component: 'AbovePrompt', props: { ...BAND, ...props } })
  const found = await band.find({ key: 'sb-guard' })
  const has = async (key: string) => (await band.find({ key })) !== undefined
  const text = found ? found.text.replace(/\s+/g, ' ').trim() : ''
  await band.unmount()
  void has
  return text
}

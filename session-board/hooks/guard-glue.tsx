// The context guard's glue: the facts it needs from the board, the countdown, the compaction call, the pilot
// log, the chip above the prompt and the Context tab. What it decides is in guard.ts (tested alone).
// Design: 90 System/Generated HTMLs/vault/context-guard-design.html
// It holds no `$`: the engine refuses a hooks module whose `$` crosses an import. It is handed a GuardIo instead.
import type { EngineInterface, RenderElement } from 'claude-code'

import type { GuardCompaction, GuardView } from '../types'
import {
  AFTER_TOKENS,
  DEFAULTS,
  DEFAULT_INSTRUCTIONS,
  afterCompact,
  afterVeto,
  compactInstructions,
  countRequest,
  decide,
  expiredDays,
  fmtCountdown,
  fmtK,
  fmtSeconds,
  formatDay,
  formatDecision,
  initialState,
  isCommitCall,
  logDir,
  logPath,
  MAX_VETO,
  MIN_VETO,
  parseConfig,
  recall,
  savingPerRequest,
  shouldLogDecision,
  sparkWithMarks,
  summarizeDay,
  wouldCompact,
} from './guard'
import type { DaySummary, Decision, DecisionLog, GuardConfig, GuardState, InstructionFacts, TurnFacts } from './guard'
import { short, same, barCells, pad2, clockTime } from './shared'
import type { Kit } from './shared'

/** What the guard asks of the engine and of the board. register.tsx builds it from its own `$` (the engine refuses a
 * hooks module whose `$` crosses an import), so the guard holds no `$` and every engine call stays in register.tsx. */
export type GuardIo = {
  // the engine
  now: () => Promise<number>
  every: (ms: number, fn: () => void) => { cancel: () => void }
  sleep: (ms: number) => Promise<void>
  toast: (text: string, o?: { timeoutMs?: number }) => void
  /** Opens the Sessions panel. */
  openPane: () => Promise<unknown>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<unknown>
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, text: string) => Promise<unknown>
  listDir: (path: string) => Promise<readonly { name: string; kind: string }[]>
  run: (argv: string[], o: { timeoutMs: number }) => Promise<unknown>
  messages: () => Promise<unknown>
  compact: (o: { instructions?: string }) => ReturnType<EngineInterface['session']['compact']>
  // the panel's state
  setGuard: (fn: (v: GuardView) => GuardView) => Promise<unknown>
  /** Switches the panel to its Context tab. */
  showContextTab: () => Promise<unknown>
  /** Open assumptions of this session, as the assumptions mod reports them. */
  review: () => Promise<{ open: number; high: number }>
  // the board
  dir: () => string
  me: () => { id: string; project: string } | undefined
  isTurnRunning: () => boolean
  /** Background shells, monitors and subagents still running. */
  jobs: () => number
  /** Files this session changed that git still shows as uncommitted. */
  uncommitted: () => { count: number; paths: string[] }
  tasks: () => string[]
  /** Running subagents, as "type · model". */
  agents: () => string[]
  refreshGit: () => Promise<void>
  git: (args: string[]) => Promise<string | undefined>
}

let gCfg: GuardConfig = DEFAULTS
let gState: GuardState = initialState()
let gCtx = 0
let gWindow = 1_000_000
let gSeries: number[] = []
let gTypedAt: number | undefined
/** The turn that just ended ran a successful git commit or push; cleared when the next turn starts. */
let gCommitted = false
let gHistory: GuardCompaction[] = []
let gPhase: GuardView['phase'] = 'idle'
let gDone: GuardView['done']
let gFailed: string | undefined
let gCountdown: number | null = null
let gTimer: { cancel: () => void } | undefined
let gHasFile = false

const INSTRUCTIONS_FILE = 'compact-instructions.md'
const GUARD_LOG_KEEP_DAYS = 30
/** The pilot log's writes, one at a time and in order; the context size of the last line, so one size is one line. */
let gLogChain: Promise<void> = Promise.resolve()
let gLastLoggedCtx: number | undefined
/** What today's log holds (every session's files), as the Context tab's line shows it; undefined until read. */
let gDay: DaySummary | undefined

function stopTick(): void {
  gTimer?.cancel()
  gTimer = undefined
}

/** A new session, or /clear: the guard starts over. */
function resetGuardSession(): void {
  stopTick()
  gState = initialState()
  gCtx = 0
  gSeries = []
  gTypedAt = undefined
  gCommitted = false
  gHistory = []
  gPhase = 'idle'
  gDone = undefined
  gFailed = undefined
  gCountdown = null
  gLastLoggedCtx = undefined
}

/** A shell call that failed: its result says so in one of the ways the tools report it. */
function isFailedResult(rec: Record<string, unknown>, raw: unknown): boolean {
  if (rec.is_error === true || rec.isError === true || rec.interrupted === true) return true
  if (typeof rec.exitCode === 'number' && rec.exitCode !== 0) return true
  return typeof raw === 'string' && /^Exit code [1-9]/.test(raw)
}

async function factsNow(io: GuardIo): Promise<TurnFacts> {
  return {
    now: await io.now(),
    ctx: gCtx,
    isWorking: io.isTurnRunning(),
    jobs: io.jobs(),
    lastTurnCommitted: gCommitted,
    uncommittedMine: io.uncommitted().count,
    lastTypedAt: gTypedAt,
  }
}

/** Decides again from the facts as they are, runs or ends the countdown, and draws. */
export async function refreshGuard(io: GuardIo, o: { git?: boolean } = {}): Promise<{ d: Decision; f: TurnFacts }> {
  if (o.git) await io.refreshGit().catch(() => undefined)
  const f = await factsNow(io)
  const d = decide(gCfg, gState, f)
  if (gCountdown !== null && !d.autoStart) {
    // The moment passed (a turn began, a job started, you typed): no countdown, no snooze.
    stopTick()
    gCountdown = null
  } else if (gCountdown === null && d.autoStart && gPhase !== 'compacting') {
    gCountdown = gCfg.vetoSeconds
    io.toast(`Context ${fmtK(f.ctx)}. Compacting in ${fmtSeconds(gCfg.vetoSeconds)}. Type anything to keep going.`, { timeoutMs: Math.min(gCfg.vetoSeconds, 10) * 1000 })
    stopTick()
    gTimer = io.every(1000, () => void tickGuard(io).catch(() => undefined))
  }
  const view: GuardView = {
    chip: d.chip,
    grade: d.grade,
    reason: d.reason,
    saving: d.saving,
    ctx: gCtx,
    window: gWindow,
    mode: gCfg.mode,
    countdown: gCountdown,
    phase: gPhase,
    done: gDone,
    failed: gFailed,
    jobs: f.jobs,
    series: gSeries,
    history: gHistory,
    adviseAt: gCfg.adviseAt,
    autoAt: gCfg.autoAt,
    vetoSeconds: gCfg.vetoSeconds,
    snoozeCtx: gState.snooze ? gState.snooze.ctx + gCfg.snoozeTokens : undefined,
    floor: gState.floor,
    hasFile: gHasFile,
    today: gDay,
  }
  await io.setGuard(v => (same(v, view) ? v : view))
  return { d, f }
}

/** Reads today's pilot log, every session's files, for the Context tab's line. Only reads: the guard is not asked to decide again. */
export async function refreshDay(io: GuardIo): Promise<void> {
  const dir = io.dir()
  if (dir === '') return
  const folder = logDir(dir, await io.now())
  const texts: string[] = []
  for (const f of await io.listDir(folder).catch(() => [])) {
    if (f.kind !== 'file' || !f.name.endsWith('.jsonl')) continue
    texts.push(await io.readFile(`${folder}/${f.name}`).catch(() => ''))
  }
  gDay = summarizeDay(texts)
  await io.setGuard(v => {
    const next = { ...v, today: gDay }
    return same(v, next) ? v : next
  })
}

/**
 * The pilot log: one line per decision, at the end of a turn that moved the context, from the dim chip up.
 * Beside the journal's log/ folder and never in it: guard/<day>/<session>.jsonl. Numbers and the verdict only:
 * no prompt text, no file names. One file per session per day, so sessions never write the same file; a write
 * that fails is dropped, and never reaches the guard.
 */
function logDecision(io: GuardIo, d: Decision, f: TurnFacts): void {
  const dir = io.dir()
  const me = io.me()
  if (dir === '' || !me) return
  const t = new Date(f.now)
  const entry: DecisionLog = {
    ts: f.now,
    at: `${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}`,
    project: me.project,
    mode: gCfg.mode,
    ctx: f.ctx,
    window: gWindow,
    chip: d.chip,
    grade: d.grade,
    reason: d.reason,
    advised: d.chip === 'advise',
    would_compact: wouldCompact(gCfg, gState, f),
    saving: d.saving,
    floor: gState.floor,
    jobs: f.jobs,
    mine: f.uncommittedMine,
    committed: f.lastTurnCommitted,
  }
  const path = logPath(dir, f.now, me.id)
  const line = formatDecision(entry)
  gLogChain = gLogChain
    .then(async () => {
      const old = await io.readFile(path).catch(() => '')
      await io.writeFile(path, `${typeof old === 'string' ? old : ''}${line}\n`)
      await refreshDay(io)
    })
    .catch(() => undefined)
}

/** Removes the guard log's day folders older than 30 days. Only date-named folders under guard/ are touched; the journal's log/ never is. */
export async function pruneGuardLogs(io: GuardIo): Promise<void> {
  const dir = io.dir()
  if (dir === '') return
  const root = `${dir}/guard`
  const entries = await io.listDir(root).catch(() => [])
  const isWindows = /^[A-Za-z]:/.test(dir)
  const old = expiredDays(entries.filter(f => f.kind === 'dir').map(f => f.name), await io.now(), GUARD_LOG_KEEP_DAYS)
  for (const name of old) {
    const path = `${root}/${name}`
    const argv = isWindows ? ['cmd', '/c', 'rd', '/s', '/q', path.replace(/\//g, '\\')] : ['rm', '-rf', '--', path]
    await io.run(argv, { timeoutMs: 10_000 }).catch(() => undefined)
  }
}

async function tickGuard(io: GuardIo): Promise<void> {
  if (gCountdown === null) return
  gCountdown -= 1
  if (gCountdown > 0) {
    await refreshGuard(io)
    return
  }
  stopTick()
  gCountdown = null
  // Still a good moment at the last second? Then compact; if not, only the chip stays.
  const f = await factsNow(io)
  if (decide(gCfg, gState, f).autoStart) await runCompaction(io, 'countdown')
  else await refreshGuard(io)
}

/** A veto (typing, the button, sending a prompt) snoozes; anything else just ends the countdown. */
async function cancelCountdown(io: GuardIo, why: 'veto' | 'moment'): Promise<void> {
  stopTick()
  gCountdown = null
  if (why === 'veto') gState = afterVeto(gCfg, gState, gCtx, await io.now())
  await refreshGuard(io)
}

/** Your own instructions file, or the built-in text. */
export async function loadInstructions(io: GuardIo): Promise<string> {
  const dir = io.dir()
  const raw = dir === '' ? undefined : await io.readFile(`${dir}/${INSTRUCTIONS_FILE}`).catch(() => undefined)
  const own = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined
  gHasFile = own !== undefined
  return own ?? DEFAULT_INSTRUCTIONS
}

/** What the board knows, for the notes the summary is told to write. */
async function instructionFacts(io: GuardIo): Promise<InstructionFacts> {
  const [branch, last] = await Promise.all([io.git(['rev-parse', '--abbrev-ref', 'HEAD']), io.git(['log', '-1', '--format=%h'])])
  const rv = await io.review()
  return {
    ctx: gCtx,
    branch: branch?.trim() || undefined,
    lastCommit: last?.trim() || undefined,
    uncommitted: io.uncommitted().paths,
    jobs: io.tasks(),
    agents: io.agents(),
    assumptions: rv.open > 0 ? [`${rv.open} open (${rv.high} high impact)`] : [],
  }
}

const textOf = (msgs: unknown): string =>
  Array.isArray(msgs) ? msgs.slice(-100).map(m => (m && typeof m === 'object' && 'text' in m ? String((m as { text: unknown }).text) : '')).join('\n') : ''

/** A compaction happened (ours or another's): the floor moves, the cooldown starts, the history grows. */
async function noteCompacted(io: GuardIo, r: { messages?: readonly { text?: string }[]; tokensBefore?: number; tokensAfter?: number }, via: string, beforeText: string): Promise<GuardCompaction> {
  const t = await io.now()
  const before = r.tokensBefore ?? gCtx
  const after = r.tokensAfter
  gState = afterCompact(gCfg, gState, { before, after, now: t })
  let kept: GuardCompaction['recall']
  try {
    const summary = (r.messages ?? []).map(m => m.text ?? '').join('\n')
    const rc = recall(beforeText, summary)
    if (rc.total > 0) kept = rc
  } catch {
    // no recall figure: the compaction still counts
  }
  const entry: GuardCompaction = { at: t, before, after, via, recall: kept }
  gHistory = [entry, ...gHistory].slice(0, 5)
  if (after !== undefined) {
    gCtx = after
    gSeries = [...gSeries, after].slice(-60)
  }
  return entry
}

/** Compacts now, from the button or the end of the countdown, with the notes and the board's facts. */
async function runCompaction(io: GuardIo, via: 'button' | 'countdown'): Promise<void> {
  if (gPhase === 'compacting') return
  stopTick()
  gCountdown = null
  gPhase = 'compacting'
  gDone = undefined
  gFailed = undefined
  await refreshGuard(io)
  try {
    const beforeText = textOf(await io.messages().catch(() => []))
    const instructions = compactInstructions({ trigger: 'plugin', base: await loadInstructions(io), facts: await instructionFacts(io) })
    // The engine rejects a compaction while a turn runs: one more try a second later.
    const call = () => io.compact({ instructions })
    const r = await call().catch(async err => {
      await io.sleep(1000)
      return call().catch(() => {
        throw err
      })
    })
    if ('skip' in r && r.skip !== undefined) {
      gPhase = 'failed'
      gFailed = String(r.skip).slice(0, 80)
    } else {
      const entry = await noteCompacted(io, r, via, beforeText)
      const pct = entry.recall ? Math.round((entry.recall.found / entry.recall.total) * 100) : undefined
      gDone = { before: entry.before, after: entry.after ?? entry.before, saving: savingPerRequest(entry.before) - savingPerRequest(entry.after ?? entry.before), recall: pct }
      gPhase = 'done'
    }
  } catch (err) {
    gPhase = 'failed'
    gFailed = String((err as { message?: unknown })?.message ?? err).slice(0, 80)
  }
  await refreshGuard(io)
}

async function setGuardMode(io: GuardIo, m: GuardConfig['mode']): Promise<void> {
  gCfg = { ...gCfg, mode: m }
  gState = { ...gState, shrinkFailures: 0 }
  if (m !== 'auto' && gCountdown !== null) {
    stopTick()
    gCountdown = null
  }
  await io.storeSet('guard.mode', m).catch(() => undefined)
  await refreshGuard(io)
}

/** The countdown length, kept between sessions. It applies from the next countdown; one already running keeps its own. */
async function setGuardVeto(io: GuardIo, seconds: number): Promise<void> {
  gCfg = { ...gCfg, vetoSeconds: Math.min(MAX_VETO, Math.max(MIN_VETO, Math.round(seconds))) }
  await io.storeSet('guard.veto', gCfg.vetoSeconds).catch(() => undefined)
  await refreshGuard(io)
}

async function createInstructionsFile(io: GuardIo): Promise<void> {
  const dir = io.dir()
  if (dir === '' || gHasFile) return
  await io.writeFile(`${dir}/${INSTRUCTIONS_FILE}`, DEFAULT_INSTRUCTIONS).catch(() => undefined)
  await loadInstructions(io)
  await refreshGuard(io)
}

/** The chip above the prompt, one row. Section 4 of the design page lists every state. */
export function guardRow(io: GuardIo, columns: number, g: GuardView, ui: Kit): RenderElement {
  const { Box, Text, Button } = ui
  const sep = (k: string) => (
    <Text key={k} dimColor>
      {'  │  '}
    </Text>
  )
  const pill = (k: string, color: string, text: string) => (
    <Text key={k} bold color="black" backgroundColor={color}>
      {` ${text} `}
    </Text>
  )
  const btn = (key: string, label: string, act: () => void) => (
    <Button key={key} plain onPress={act}>
      <Text color="blue">{`[ ${label} ]`}</Text>
    </Button>
  )
  const compactNow = () => void runCompaction(io, 'button').catch(() => undefined)
  const later = () =>
    void (async () => {
      gState = afterVeto(gCfg, gState, gCtx, await io.now())
      await refreshGuard(io)
    })().catch(() => undefined)
  const openTab = () =>
    void (async () => {
      await io.showContextTab()
      void refreshDay(io).catch(() => undefined)
      await io.openPane()
    })().catch(() => undefined)
  const ctx = fmtK(g.ctx)
  const parts: RenderElement[] = []
  if (g.phase === 'compacting') {
    parts.push(pill('sb-g-p', 'magenta', '⟳ compacting'), <Text key="sb-g-t" dimColor>{` the summary is being written · ctx ${ctx}`}</Text>)
  } else if (g.phase === 'done' && g.done) {
    parts.push(
      pill('sb-g-p', 'green', '✓ compacted'),
      <Text key="sb-g-t">{` ${fmtK(g.done.before)} → ${fmtK(g.done.after)}`}</Text>,
      sep('sb-g-s1'),
      <Text key="sb-g-save" color="green">{`−$${g.done.saving.toFixed(2)} per request`}</Text>,
      sep('sb-g-s2'),
      btn('sb-guard-see', 'see summary', openTab),
      ...(g.done.recall !== undefined ? [<Text key="sb-g-rc" dimColor>{` · recall ${g.done.recall}%`}</Text>] : []),
    )
  } else if (g.phase === 'failed') {
    parts.push(pill('sb-g-p', 'red', '✗ compact failed'), <Text key="sb-g-t" dimColor>{` ${g.failed ?? ''}`}</Text>)
  } else if (g.countdown !== null) {
    const [filled, empty] = barCells(g.countdown, g.vetoSeconds, 10)
    parts.push(
      pill('sb-g-p', 'cyan', `⏳ compacting in ${fmtCountdown(g.countdown)}`),
      <Text key="sb-g-t">{` ctx ${ctx} → about ${fmtK(AFTER_TOKENS)} `}</Text>,
      <Text key="sb-g-bar">
        <Text color="cyan">{'▰'.repeat(filled)}</Text>
        <Text dimColor>{'▱'.repeat(empty)}</Text>
      </Text>,
      sep('sb-g-s1'),
      btn('sb-guard-keep', 'Keep going', () => void cancelCountdown(io, 'veto').catch(() => undefined)),
      <Text key="sb-g-hint" dimColor>{' typing also cancels'}</Text>,
    )
  } else if (g.chip === 'dim') {
    parts.push(<Text key="sb-g-t" dimColor>{`ctx ${ctx}`}</Text>)
  } else if (g.chip === 'advise') {
    parts.push(pill('sb-g-p', 'yellow', `ctx ${ctx}`), <Text key="sb-g-sp"> </Text>)
    if (columns < 60) parts.push(btn('sb-guard-now', 'compact', compactNow))
    else {
      parts.push(
        g.grade === 'good' ? <Text key="sb-g-gr" color="green">good moment: just committed</Text> : <Text key="sb-g-gr" dimColor>ok moment</Text>,
        sep('sb-g-s1'),
        <Text key="sb-g-sv" dimColor>{`compacting saves about $${g.saving.toFixed(2)} per request`}</Text>,
        sep('sb-g-s2'),
        btn('sb-guard-now', 'Compact now', compactNow),
        <Text key="sb-g-sp2"> </Text>,
        btn('sb-guard-later', 'Later', later),
      )
    }
  } else if (g.chip === 'held') {
    parts.push(
      pill('sb-g-p', 'red', '⚑ held'),
      <Text key="sb-g-t">{` ctx ${ctx} · `}</Text>,
      g.reason === 'jobs' ? <Text key="sb-g-why" color="red">{`${g.jobs} background job${g.jobs === 1 ? '' : 's'} running`}</Text> : <Text key="sb-g-why" color="red">you are typing</Text>,
    )
    if (columns >= 60) parts.push(sep('sb-g-s1'), btn('sb-guard-now', 'Compact anyway', compactNow))
  } else if (g.chip === 'snoozed') {
    parts.push(<Text key="sb-g-t" dimColor>{`ctx ${ctx} · snoozed until ${fmtK(g.snoozeCtx ?? g.ctx)} or 30 min`}</Text>)
  } else if (g.chip === 'stopped') {
    parts.push(pill('sb-g-p', 'red', '■ stopped'), <Text key="sb-g-t" dimColor>{' two compactions in a row did not shrink the context · pick a mode in the Context tab to start again'}</Text>)
  }
  return (
    <Box key="sb-guard" flexWrap="wrap">
      {parts}
    </Box>
  )
}

/** The Context tab: mode, thresholds, the sparkline, the last compactions, the notes the summary is told. */
export function contextPane(io: GuardIo, g: GuardView, t: number, width: number, ui: Kit): RenderElement {
  const { Box, Text, Button } = ui
  const modeBtn = (m: GuardConfig['mode'], label: string) => (
    <Button key={`sb-guard-mode-${m}`} plain onPress={() => void setGuardMode(io, m).catch(() => undefined)}>
      {g.mode === m ? (
        <Text bold color="black" backgroundColor="cyan">{` ${label} `}</Text>
      ) : (
        <Text dimColor>{` ${label} `}</Text>
      )}
    </Button>
  )
  const payback = g.saving > 0 ? Math.ceil(0.35 / g.saving) : undefined
  // The presets, and the current length too when it came from /config and is not one of them.
  const lengths = [...new Set([10, 30, 60, 120, 300, g.vetoSeconds])].sort((a, b) => a - b)
  const vetoBtn = (n: number) => (
    <Button key={`sb-guard-veto-${n}`} plain onPress={() => void setGuardVeto(io, n).catch(() => undefined)}>
      {g.vetoSeconds === n ? (
        <Text bold color="black" backgroundColor="cyan">{` ${fmtSeconds(n)} `}</Text>
      ) : (
        <Text dimColor>{` ${fmtSeconds(n)} `}</Text>
      )}
    </Button>
  )
  return (
    <Box flexDirection="column">
      <Box flexWrap="wrap">
        <Text>
          <Text bold>{`Context ${fmtK(g.ctx)}`}</Text>
          <Text dimColor>{` of ${fmtK(g.window)}`}</Text>
        </Text>
        <Text>{'      mode  '}</Text>
        {modeBtn('advise', 'Advise')}
        {modeBtn('auto', 'Auto')}
        {modeBtn('off', 'Off')}
      </Box>
      <Text dimColor>{`advise ${fmtK(g.adviseAt)} · auto ${fmtK(g.autoAt)} · veto ${fmtSeconds(g.vetoSeconds)}`}</Text>
      <Box flexWrap="wrap">
        <Text dimColor>{'auto countdown  '}</Text>
        {lengths.map(vetoBtn)}
        <Text dimColor>{'  typing, Keep going or a prompt cancels it'}</Text>
      </Box>
      {g.series.length > 0 && (
        <Text>
          <Text color="cyan">{sparkWithMarks(g.series, g.window)}</Text>
          <Text dimColor>{'   one bar per turn · │ = a compaction'}</Text>
        </Text>
      )}
      <Text>
        <Text dimColor>{'now → after: '}</Text>
        {`${fmtK(g.ctx)} → about ${fmtK(AFTER_TOKENS)}`}
        <Text color="green">{`   saves about $${g.saving.toFixed(2)} per request`}</Text>
        {payback !== undefined && <Text dimColor>{`   pays back in about ${payback} requests`}</Text>}
      </Text>
      {g.today && (
        <Box key="sb-guard-day" flexWrap="wrap">
          <Text dimColor>{'pilot log today  '}</Text>
          <Text>{formatDay(g.today)}</Text>
        </Box>
      )}
      <Box marginTop={1} flexWrap="wrap">
        <Button key="sb-guard-compact" plain onPress={() => void runCompaction(io, 'button').catch(() => undefined)}>
          <Text color="blue">[ Compact now ]</Text>
        </Button>
      </Box>
      <Box marginTop={1}>
        <Text bold>Last compactions</Text>
      </Box>
      {g.history.length === 0 && <Text dimColor>none yet</Text>}
      {g.history.map((item, i) => (
        <Box key={`sb-guard-h-${i}`} flexWrap="wrap">
          <Text>{`  ${clockTime(item.at)}   ${fmtK(item.before)} → ${item.after !== undefined ? fmtK(item.after) : '?'}   `}</Text>
          {item.recall && (
            <Text color={item.recall.found / item.recall.total >= 0.9 ? 'green' : 'yellow'}>{`recall ${Math.round((item.recall.found / item.recall.total) * 100)}%`}</Text>
          )}
          {item.recall && item.recall.missing.length > 0 && <Text dimColor>{` missing: ${item.recall.missing.slice(0, 3).join(', ')}`}</Text>}
          <Text dimColor>{`   ${item.via}`}</Text>
        </Box>
      ))}
      <Box marginTop={1} flexWrap="wrap">
        <Text bold>The summary is told  </Text>
        <Text dimColor>{`~/.claude/session-board/${INSTRUCTIONS_FILE}${g.hasFile ? ' (yours)' : ' (built-in text)'}`}</Text>
        {!g.hasFile && (
          <Button key="sb-guard-file" plain onPress={() => void createInstructionsFile(io)}>
            <Text color="blue">{'  [ create file to edit ]'}</Text>
          </Button>
        )}
      </Box>
      <Text dimColor>{short('1 Rules still in force · 2 State · 3 Identifiers, copied exactly · 4 Decisions · 5 Open questions · 6 Verify first', width)}</Text>
      <Text dimColor>{short('+ facts from the board: branch, last commit, uncommitted files, jobs, subagents, open assumptions', width)}</Text>
      {void t}
    </Box>
  )
}


// ── what register.tsx calls ───────────────────────────────────────────────────
// One function per place where the board's hooks meet the guard. The state above is private to this file.

/** A new session: the options, then the mode and countdown length you last chose in the Context tab. */
export async function configureGuard(io: GuardIo, options: Parameters<typeof parseConfig>[0]): Promise<void> {
  gCfg = parseConfig(options)
  const saved = await io.storeGet('guard.mode').catch(() => undefined)
  if (saved === 'off' || saved === 'advise' || saved === 'auto') gCfg = { ...gCfg, mode: saved }
  const savedVeto = await io.storeGet('guard.veto').catch(() => undefined)
  if (typeof savedVeto === 'number' && Number.isFinite(savedVeto) && savedVeto >= MIN_VETO && savedVeto <= MAX_VETO) gCfg = { ...gCfg, vetoSeconds: Math.round(savedVeto) }
  resetGuardSession()
}

/** You sent a prompt: a veto of a running countdown, and the end of the last compaction's result row. */
export async function guardPromptSent(io: GuardIo): Promise<void> {
  gTypedAt = undefined
  if (gCountdown !== null) await cancelCountdown(io, 'veto').catch(() => undefined)
  else if (gPhase === 'done' || gPhase === 'failed') {
    gPhase = 'idle'
    await refreshGuard(io).catch(() => undefined)
  }
}

/** A turn began: whatever was committed before it no longer counts as "just committed". */
export async function guardTurnStarted(io: GuardIo): Promise<void> {
  gCommitted = false
  await refreshGuard(io).catch(() => undefined)
}

/** One more model request of the main loop (the cooldown counts requests). */
export function guardRequestCounted(): void {
  gState = countRequest(gState)
}

/** A tool call finished: a successful git commit or push by the main loop makes this a good moment. */
export function noteGuardCall(c: { isMainLoop: boolean; tool: string; args: Record<string, unknown>; rec: Record<string, unknown>; raw: unknown }): void {
  if (c.isMainLoop && (c.tool === 'Bash' || c.tool === 'PowerShell') && typeof c.args.command === 'string' && isCommitCall(c.args.command) && !isFailedResult(c.rec, c.raw)) gCommitted = true
}

/** The session ended: the countdown stops, and /clear starts the guard over. */
export function guardSessionEnded(reason: string): void {
  stopTick()
  if (reason === 'clear') resetGuardSession()
}

/** The engine pushed the context size after a turn. Git is read here, once per turn. */
export async function guardMeasured(io: GuardIo, m: { tokens: number | undefined; window: number; changed: readonly string[] }): Promise<void> {
  const tokens = m.tokens
  if (typeof tokens === 'number') {
    gCtx = tokens
    gWindow = m.window
    if (m.changed.includes('context')) gSeries = [...gSeries, tokens].slice(-60)
  }
  const r = await refreshGuard(io, { git: tokens !== undefined && tokens >= gCfg.dimAt })
  if (typeof tokens === 'number' && shouldLogDecision({ changedContext: m.changed.includes('context'), chip: r.d.chip, ctx: gCtx, lastCtx: gLastLoggedCtx })) {
    gLastLoggedCtx = gCtx
    logDecision(io, r.d, r.f)
  }
}

/** Typing is the main veto: the first edit while the countdown runs cancels it. */
export async function guardTyped(io: GuardIo): Promise<void> {
  gTypedAt = await io.now()
  if (gCountdown !== null) await cancelCountdown(io, 'veto')
  else if (gCtx >= gCfg.adviseAt) await refreshGuard(io)
}

/** The notes any compaction of this conversation is told to keep; undefined leaves your own /compact text alone. */
export async function compactionNotes(io: GuardIo, c: { trigger: Parameters<typeof compactInstructions>[0]['trigger']; instructions?: string }): Promise<ReturnType<typeof compactInstructions>> {
  return compactInstructions({ trigger: c.trigger, userText: c.instructions, base: await loadInstructions(io), facts: await instructionFacts(io) })
}

/** A compaction the engine or you started has finished. */
export async function guardCompacted(io: GuardIo, r: Parameters<typeof noteCompacted>[1], trigger: string, messages: unknown): Promise<void> {
  await noteCompacted(io, r, trigger, textOf(messages))
  await refreshGuard(io)
}

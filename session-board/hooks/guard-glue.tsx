// The context guard's glue: the facts it needs from the board, the picker, the pilot log, the chip above the
// prompt and the Context tab. What it decides is in guard.ts (tested alone).
// Design: 90 System/Generated HTMLs/vault/context-guard-design.html and .../compact-picker-design.html
// Plan: 90 System/Plans/2026-10-14-session-board-compact-picker.md
// THE RULE (0.19.0): the guard types, you press Enter. It never runs compact or clear. Every button here only fills
// the prompt box (`io.fill`); the one compaction call anywhere is the engine's own, after you press Enter.
// It holds no `$`: the engine refuses a hooks module whose `$` crosses an import. It is handed a GuardIo instead.
import type { RenderElement } from 'claude-code'

import type { GuardCompaction, GuardView } from '../types'
import {
  AFTER_TOKENS,
  DEFAULTS,
  DEFAULT_INSTRUCTIONS,
  DEFAULT_PICKS,
  PICK_ORDER,
  afterCompact,
  boxIsFree,
  buildCompactCommand,
  compactInstructions,
  countRequest,
  decide,
  expiredDays,
  fmtK,
  formatDay,
  formatDecision,
  initialState,
  isCommitCall,
  logDir,
  logPath,
  parseConfig,
  parseMode,
  pickCount,
  recall,
  savingPerRequest,
  shouldLogDecision,
  sparkWithMarks,
  summarizeDay,
} from './guard'
import type { DaySummary, Decision, DecisionLog, GuardConfig, GuardState, InstructionFacts, PickFacts, PickId, Picks, TurnFacts } from './guard'
import { short, same, pad2, clockTime, FIRST_COL, LABEL_BG, LINK } from './shared'
import type { Kit } from './shared'

/** What the guard asks of the engine and of the board. register.tsx builds it from its own `$` (the engine refuses a
 * hooks module whose `$` crosses an import), so the guard holds no `$` and every engine call stays in register.tsx. */
export type GuardIo = {
  // the engine
  now: () => Promise<number>
  toast: (text: string, o?: { timeoutMs?: number }) => void
  /** Opens the Sessions panel. */
  openPane: () => Promise<unknown>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<unknown>
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, text: string) => Promise<unknown>
  listDir: (path: string) => Promise<readonly { name: string; kind: string }[]>
  run: (argv: string[], o: { timeoutMs: number }) => Promise<unknown>
  /** Types text into the prompt box (replace mode). It answers `isFilled`; nothing is submitted. */
  fill: (text: string) => Promise<{ isFilled?: boolean } | undefined>
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
  /** The open items (pending or in progress) of this session's task list. */
  todoLines: () => string[]
  /** The jobs still running, by name: background shells and monitors, and subagents. Its length is the count the chip calls `jobs`. */
  jobLines: () => string[]
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
/** The turn that just ended ran a successful git commit or push; cleared when the next turn starts. */
let gCommitted = false
let gHistory: GuardCompaction[] = []
let gPhase: GuardView['phase'] = 'idle'
let gDone: GuardView['done']
let gFailed: string | undefined
let gHasFile = false
/** What the prompt box holds now (from the edit events), and the last text a button typed into it. */
let gBox = ''
let gFilled: string | undefined
/** The picker in the Context tab: open or not, which rows are ticked, and what the board offers to keep. */
let gPickOpen = false
/** The Actions menu under the chip: open or not. Closed by a pick, by words in the box and by a prompt you send. */
let gMenuOpen = false
let gPicks: Picks = { ...DEFAULT_PICKS }
const NO_FACTS: PickFacts = { tasks: [], files: [], jobs: [], assumptions: 0, high: 0 }
let gFacts: PickFacts = NO_FACTS

const INSTRUCTIONS_FILE = 'compact-instructions.md'
const GUARD_LOG_KEEP_DAYS = 30
/** The pilot log's writes, one at a time and in order; the context size of the last line, so one size is one line. */
let gLogChain: Promise<void> = Promise.resolve()
let gLastLoggedCtx: number | undefined
/** What today's log holds (every session's files), as the Context tab's line shows it; undefined until read. */
let gDay: DaySummary | undefined

/** A new session, or /clear: the guard starts over. */
function resetGuardSession(): void {
  gState = initialState()
  gCtx = 0
  gSeries = []
  gCommitted = false
  gHistory = []
  gPhase = 'idle'
  gDone = undefined
  gFailed = undefined
  gLastLoggedCtx = undefined
  gBox = ''
  gFilled = undefined
  gPickOpen = false
  gMenuOpen = false
  gPicks = { ...DEFAULT_PICKS }
  gFacts = NO_FACTS
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
  }
}

/** What the board offers to keep: this session's open task items, its uncommitted files, running jobs and the open assumptions. */
async function pickFacts(io: GuardIo): Promise<PickFacts> {
  const rv = await io.review().catch(() => ({ open: 0, high: 0 }))
  return { tasks: io.todoLines(), files: io.uncommitted().paths, jobs: io.jobLines(), assumptions: rv.open, high: rv.high }
}

/** Decides again from the facts as they are, and draws. Nothing here starts a compaction. */
export async function refreshGuard(io: GuardIo, o: { git?: boolean } = {}): Promise<{ d: Decision; f: TurnFacts }> {
  if (o.git) await io.refreshGit().catch(() => undefined)
  const f = await factsNow(io)
  const d = decide(gCfg, gState, f)
  gFacts = await pickFacts(io)
  // The menu belongs to a chip that offers it, and to a box you have not typed in.
  if (d.chip === 'none' || gPhase === 'compacting' || gPhase === 'done' || !boxIsFree(gBox, gFilled)) gMenuOpen = false
  const view: GuardView = {
    chip: d.chip,
    grade: d.grade,
    reason: d.reason,
    saving: d.saving,
    ctx: gCtx,
    window: gWindow,
    mode: gCfg.mode,
    phase: gPhase,
    done: gDone,
    failed: gFailed,
    jobs: f.jobs,
    series: gSeries,
    history: gHistory,
    adviseAt: gCfg.adviseAt,
    floor: gState.floor,
    hasFile: gHasFile,
    today: gDay,
    pickOpen: gPickOpen,
    picks: gPicks,
    facts: gFacts,
    command: buildCompactCommand(gPicks, gFacts),
    boxHolds: !boxIsFree(gBox, gFilled),
    menuOpen: gMenuOpen,
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

/** A compaction happened (yours, after you pressed Enter, or the engine's own): the floor moves, the cooldown starts, the history grows. */
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

/** A compaction has begun (you pressed Enter on a /compact, or the engine started its own): the chip says so. */
export async function guardCompacting(io: GuardIo): Promise<void> {
  gPhase = 'compacting'
  gDone = undefined
  gFailed = undefined
  await refreshGuard(io)
}

/** The engine refused the compaction, or it failed: the chip says why. */
export async function guardCompactFailed(io: GuardIo, why: string): Promise<void> {
  gPhase = 'failed'
  gFailed = why.slice(0, 80)
  await refreshGuard(io)
}

async function setGuardMode(io: GuardIo, m: GuardConfig['mode']): Promise<void> {
  gCfg = { ...gCfg, mode: m }
  gState = { ...gState, shrinkFailures: 0 }
  await io.storeSet('guard.mode', m).catch(() => undefined)
  await refreshGuard(io)
}

// ── the buttons: they type, you press Enter ───────────────────────────────────

/**
 * Types a command into the prompt box. Returns true when the box took it. A button that finds your own text in the
 * box does nothing (the buttons are drawn off then); a refused fill says so and shows where to read the command.
 */
async function typeCommand(io: GuardIo, text: string): Promise<boolean> {
  if (!boxIsFree(gBox, gFilled)) return false
  // The engine may report the edit our own fill makes before fill() returns: the text is ours from the first moment.
  const before = gFilled
  gFilled = text
  const r = await io.fill(text).catch(() => undefined)
  if (!r?.isFilled) {
    gFilled = before
    io.toast(text.length <= 120 ? `Could not type into the prompt box. Type this by hand: ${text}` : 'Could not type into the prompt box. The command is shown in the Context tab of /sessions.', { timeoutMs: 8000 })
    return false
  }
  gBox = text
  await refreshGuard(io)
  return true
}

/** Opens or closes the Actions menu under the chip. */
async function toggleMenu(io: GuardIo): Promise<void> {
  gMenuOpen = !gMenuOpen
  await refreshGuard(io)
}

/** A menu pick that types: the menu closes, the command goes into the box (the box may refuse), and you press Enter. */
async function chooseTyped(io: GuardIo, text: string): Promise<void> {
  gMenuOpen = false
  await typeCommand(io, text)
  await refreshGuard(io)
}

/** Opens the picker in the Context tab. */
async function openPicker(io: GuardIo): Promise<void> {
  // Open the panel first, inside the press. After an await the engine counts the open as unasked, and a window
  // under 144 columns then leaves the panel undrawn (found with the strip's turn button, 2026-10-15).
  const opening = io.openPane().catch(() => undefined)
  gMenuOpen = false
  gPickOpen = true
  await refreshGuard(io)
  await io.showContextTab()
  void refreshDay(io).catch(() => undefined)
  await opening
}

async function closePicker(io: GuardIo): Promise<void> {
  gPickOpen = false
  await refreshGuard(io)
}

async function togglePick(io: GuardIo, id: PickId): Promise<void> {
  gPicks = { ...gPicks, [id]: !gPicks[id] }
  await refreshGuard(io)
}

/** The picker's "Type it": the previewed command goes into the box, and the picker closes when the box took it. */
async function typePicked(io: GuardIo): Promise<void> {
  if (await typeCommand(io, buildCompactCommand(gPicks, gFacts))) await closePicker(io)
}

async function createInstructionsFile(io: GuardIo): Promise<void> {
  const dir = io.dir()
  if (dir === '' || gHasFile) return
  await io.writeFile(`${dir}/${INSTRUCTIONS_FILE}`, DEFAULT_INSTRUCTIONS).catch(() => undefined)
  await loadInstructions(io)
  await refreshGuard(io)
}

/** Which state of the context row is drawn, tested in the order `guardRow` tests them. */
export type GuardLook = 'compacting' | 'done' | 'failed' | 'dim' | 'advise' | 'stopped' | 'none'
export function guardLook(g: GuardView): GuardLook {
  if (g.phase === 'compacting') return 'compacting'
  if (g.phase === 'done' && g.done) return 'done'
  if (g.phase === 'failed') return 'failed'
  if (g.chip === 'dim') return 'dim'
  if (g.chip === 'advise') return 'advise'
  if (g.chip === 'stopped') return 'stopped'
  return 'none'
}

/**
 * True when the row starts with a black status chip (compacting, compacted, failed, stopped). Such a row must not sit
 * directly under the strip, whose chips are black too: they would read as one slab, so an empty row goes between. The
 * quiet and advice rows start with the plain Actions button, so they sit right under the strip.
 */
export function guardOpensWithChip(g: GuardView): boolean {
  const look = guardLook(g)
  return look !== 'none' && look !== 'dim' && look !== 'advise'
}

/**
 * The row above the prompt, one row, and the Actions menu under it while that is open. Section 4 of the design page
 * lists every state. One Actions button replaces the separate Compact, Plain, Later and /clear buttons: it opens a
 * menu of three picks, and each pick only TYPES into the prompt box (you press Enter), as the buttons did.
 * The context size is not here: it is in the usage gauge's context meter, under the prompt. The quiet and advice rows
 * start with the Actions button; the status rows start with their black chip.
 */
export function guardRow(io: GuardIo, columns: number, g: GuardView, ui: Kit): RenderElement {
  const { Box, Text, Button } = ui
  const sep = (k: string) => (
    <Text key={k} dimColor>
      {'  │  '}
    </Text>
  )
  // A status is the status colour as text on the same true black as the strip's chips (the CHECK flag and the review
  // chip in the strip above are not statuses and keep their yellow block). The advice's number is neutral (white): it
  // is an optional hint, so it must not be louder than the CHECK flag, and yellow already means "needs you".
  const statusChip = (k: string, color: string, text: string) => (
    <Text key={k} bold color={color} backgroundColor={LABEL_BG}>
      {` ${text} `}
    </Text>
  )
  // The button sits right after the chip (first in the row when there is none), and the menu opens beneath it: each
  // row's marker is under the button's first letter. It is drawn off, as dim text, while the box holds words of yours;
  // the row then says why, at its end.
  const actions = (): RenderElement => (
    g.boxHolds ? (
      <Text key="sb-guard-menu" dimColor>{'Actions ▾'}</Text>
    ) : (
      <Button key="sb-guard-menu" plain onPress={() => void toggleMenu(io).catch(() => undefined)}>
        <Text color={LINK}>{g.menuOpen ? 'Actions ▴' : 'Actions ▾'}</Text>
      </Button>
    )
  )
  const boxNote = g.boxHolds ? <Text key="sb-g-boxnote" dimColor>{'  the box has your text'}</Text> : null
  // The cells before "Actions": the chip's text, its one cell of padding either side, and one space. The chip is padded
  // to the same width as the strip's "current" chip, so the button starts in the same cell as the status above it.
  let anchor = 0
  const chipped = (color: string, text: string): RenderElement[] => {
    const padded = text.padEnd(FIRST_COL)
    anchor = padded.length + 3
    return [statusChip('sb-g-p', color, padded), <Text key="sb-g-sp"> </Text>, actions()]
  }
  const MENU: [string, string, string, () => void][] = [
    ['sb-guard-pick', 'Compact…', 'choose what to keep', () => void openPicker(io).catch(() => undefined)],
    ['sb-guard-plain', 'Plain compact', 'types /compact', () => void chooseTyped(io, '/compact').catch(() => undefined)],
    ['sb-guard-clear', 'Clear', 'types /clear', () => void chooseTyped(io, '/clear').catch(() => undefined)],
  ]
  // One label column for all rows: the longest label and three spaces, so every hint starts in the same cell.
  const labelWidth = Math.max(...MENU.map(m => m[1].length)) + 3
  const menu = () => (
    <Box key="sb-guard-rows" flexDirection="column">
      {MENU.map(([key, label, hint, act]) => (
        <Button key={key} plain onPress={act}>
          <Text>
            <Text color={LINK}>{`${' '.repeat(anchor)}▸ ${label.padEnd(labelWidth)}`}</Text>
            <Text dimColor>{hint}</Text>
          </Text>
        </Button>
      ))}
    </Box>
  )
  const openTab = () =>
    void (async () => {
      await io.showContextTab()
      void refreshDay(io).catch(() => undefined)
      await io.openPane()
    })().catch(() => undefined)
  const btn = (key: string, label: string, act: () => void) => (
    <Button key={key} plain onPress={act}>
      <Text color={LINK}>{`[ ${label} ]`}</Text>
    </Button>
  )
  const ctx = fmtK(g.ctx)
  const look = guardLook(g)
  const parts: RenderElement[] = []
  // The states that offer the menu: the quiet row, the advice, a failed compaction and the stop.
  let hasMenu = false
  if (look === 'compacting') {
    parts.push(statusChip('sb-g-p', 'magenta', '⟳ compacting'), <Text key="sb-g-t" dimColor>{` the summary is being written · ctx ${ctx}`}</Text>)
  } else if (look === 'done' && g.done) {
    parts.push(
      statusChip('sb-g-p', 'green', '✓ compacted'),
      <Text key="sb-g-t">{` ${fmtK(g.done.before)} → ${fmtK(g.done.after)}`}</Text>,
      sep('sb-g-s1'),
      <Text key="sb-g-save" color="green">{`−$${g.done.saving.toFixed(2)} per request`}</Text>,
      sep('sb-g-s2'),
      btn('sb-guard-see', 'see summary', openTab),
      ...(g.done.recall !== undefined ? [<Text key="sb-g-rc" dimColor>{` · recall ${g.done.recall}%`}</Text>] : []),
    )
  } else if (look === 'failed') {
    hasMenu = true
    parts.push(...chipped('red', '✗ compact failed'), <Text key="sb-g-t" dimColor>{`  ${g.failed ?? ''}`}</Text>)
  } else if (look === 'dim') {
    // Quiet: nothing but the button. The size is in the gauge's context meter.
    hasMenu = true
    parts.push(actions())
  } else if (look === 'advise') {
    hasMenu = true
    parts.push(actions())
    if (columns >= 60) {
      parts.push(
        <Text key="sb-g-gap">{'  '}</Text>,
        g.grade === 'good' ? <Text key="sb-g-gr" color="green">good moment: just committed</Text> : <Text key="sb-g-gr" dimColor>ok moment</Text>,
        // Background work does not hold the advice back; the line only says it is there.
        ...(g.jobs > 0 ? [<Text key="sb-g-jobs" dimColor>{` · ${g.jobs} ${g.jobs === 1 ? 'job' : 'jobs'} running`}</Text>] : []),
        sep('sb-g-s1'),
        <Text key="sb-g-sv" dimColor>{`compacting saves about $${g.saving.toFixed(2)} per request`}</Text>,
      )
    }
  } else if (look === 'stopped') {
    hasMenu = true
    parts.push(
      ...chipped('red', '■ stopped'),
      <Text key="sb-g-t" dimColor>{'  two compactions in a row did not shrink the context · pick a mode in the Context tab to start again'}</Text>,
    )
  }
  return (
    <Box key="sb-guard" flexDirection="column">
      <Box key="sb-guard-line" flexWrap="wrap">
        {parts}
        {hasMenu && boxNote}
      </Box>
      {hasMenu && g.menuOpen && !g.boxHolds && menu()}
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
  // The buttons that type are drawn off, as dim text, while the box holds words of yours.
  const typing = (key: string, label: string, act: () => void) =>
    g.boxHolds ? (
      <Text key={key} dimColor>{`[ ${label} ]  `}</Text>
    ) : (
      <Button key={key} plain onPress={act}>
        <Text color={LINK}>{`[ ${label} ]  `}</Text>
      </Button>
    )
  const pickLabel: Record<PickId, string> = {
    notes: 'Six-part notes',
    lean: 'Leave out tool output and logs',
    tasks: "Open items of this session's task list",
    files: 'Uncommitted files of this session',
    jobs: 'Running jobs',
    assumptions: 'Open assumptions',
  }
  const pickHint: Partial<Record<PickId, string>> = { notes: 'rules, state, identifiers, decisions, questions, what to verify' }
  const pickRow = (id: PickId) => {
    const n = pickCount(id, g.facts)
    const counted = id === 'notes' || id === 'lean' ? '' : ` (${n})`
    if (n === 0) {
      return (
        <Text key={`sb-guard-pk-${id}`} dimColor>{`    [ ] ${pickLabel[id]}${counted}  nothing to keep`}</Text>
      )
    }
    return (
      <Button key={`sb-guard-pk-${id}`} plain onPress={() => void togglePick(io, id).catch(() => undefined)}>
        <Text>
          <Text color={g.picks[id] ? 'green' : undefined}>{`    [${g.picks[id] ? 'x' : ' '}] `}</Text>
          {`${pickLabel[id]}${counted}`}
          {pickHint[id] !== undefined && <Text dimColor>{`  ${pickHint[id]}`}</Text>}
        </Text>
      </Button>
    )
  }
  return (
    <Box flexDirection="column">
      <Box flexWrap="wrap">
        <Text>
          <Text bold>{`Context ${fmtK(g.ctx)}`}</Text>
          <Text dimColor>{` of ${fmtK(g.window)}`}</Text>
        </Text>
        <Text>{'      mode  '}</Text>
        {modeBtn('advise', 'Advise')}
        {modeBtn('off', 'Off')}
      </Box>
      <Text dimColor>{`advise from ${fmtK(g.adviseAt)} · the buttons type the command; you press Enter`}</Text>
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
        {typing('sb-guard-tab-pick', 'Compact…', () => void openPicker(io).catch(() => undefined))}
        {typing('sb-guard-tab-plain', 'Plain', () => void typeCommand(io, '/compact').catch(() => undefined))}
        {typing('sb-guard-tab-clear', '/clear', () => void typeCommand(io, '/clear').catch(() => undefined))}
        {g.boxHolds && <Text dimColor>{'the box has your text; send or clear it first'}</Text>}
      </Box>
      {g.pickOpen && (
        <Box key="sb-guard-picker" flexDirection="column" marginTop={1}>
          <Text bold>Compact: choose what to keep</Text>
          {PICK_ORDER.map(pickRow)}
          <Text dimColor>{'The command the mod will type. Add your own words at the end of the box, then press Enter:'}</Text>
          <Text key="sb-guard-command">{g.command}</Text>
          <Box flexWrap="wrap">
            {typing('sb-guard-type', 'Type it in the prompt box', () => void typePicked(io).catch(() => undefined))}
            <Button key="sb-guard-pick-cancel" plain onPress={() => void closePicker(io).catch(() => undefined)}>
              <Text color={LINK}>[ Cancel ]</Text>
            </Button>
          </Box>
        </Box>
      )}
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
        <Text bold>The engine's own late compaction is told  </Text>
        <Text dimColor>{`~/.claude/session-board/${INSTRUCTIONS_FILE}${g.hasFile ? ' (yours)' : ' (built-in text)'}`}</Text>
        {!g.hasFile && (
          <Button key="sb-guard-file" plain onPress={() => void createInstructionsFile(io)}>
            <Text color={LINK}>{'  [ create file to edit ]'}</Text>
          </Button>
        )}
      </Box>
      <Text dimColor>{short('1 Rules still in force · 2 State · 3 Identifiers, copied exactly · 4 Decisions · 5 Open questions · 6 Verify first', width)}</Text>
      <Text dimColor>{short('+ facts from the board: branch, last commit, uncommitted files, jobs, subagents, open assumptions', width)}</Text>
      <Text dimColor>{short('A /compact you press Enter on is never changed: a bare one is plain, and the words after it are yours.', width)}</Text>
      {void t}
    </Box>
  )
}


// ── what register.tsx calls ───────────────────────────────────────────────────
// One function per place where the board's hooks meet the guard. The state above is private to this file.

/**
 * A new session: the options, then the mode you last chose in the Context tab. A stored `auto` (the mode went in
 * 0.19.0) reads as `advise`; a stored countdown length (`guard.veto`) is never read.
 */
export async function configureGuard(io: GuardIo, options: Parameters<typeof parseConfig>[0]): Promise<void> {
  gCfg = parseConfig(options)
  const saved = await io.storeGet('guard.mode').catch(() => undefined)
  if (saved === 'off' || saved === 'advise' || saved === 'auto') gCfg = { ...gCfg, mode: parseMode(saved) }
  // Whether you keep your own notes file, for the Context tab and for the engine's own late compaction.
  await loadInstructions(io).catch(() => undefined)
  resetGuardSession()
}

/** You sent a prompt: the box is empty again, and the last compaction's result row ends. */
export async function guardPromptSent(io: GuardIo): Promise<void> {
  gMenuOpen = false
  gBox = ''
  gFilled = undefined
  if (gPhase === 'done' || gPhase === 'failed') gPhase = 'idle'
  await refreshGuard(io).catch(() => undefined)
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

/** The session ended: /clear starts the guard over. */
export function guardSessionEnded(reason: string): void {
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

/**
 * The prompt box was edited; `text` is what it holds now. Words you type switch the Actions menu off (and close it).
 * Text the menu typed does not, and an emptied box switches it on again.
 */
export async function guardTyped(io: GuardIo, text: string): Promise<void> {
  const wasFree = boxIsFree(gBox, gFilled)
  gBox = text
  if (text.trim() === '') gFilled = undefined
  if (boxIsFree(gBox, gFilled) !== wasFree) await refreshGuard(io)
}

/**
 * The notes a compaction of this conversation is told to keep, or undefined to leave it as it was asked. A `/compact`
 * you press Enter on is never changed (a bare one is plain, the words after it are yours); only the engine's own
 * late compaction and a precompute get the recipe.
 */
export async function compactionNotes(io: GuardIo, c: { trigger: Parameters<typeof compactInstructions>[0]['trigger'] }): Promise<ReturnType<typeof compactInstructions>> {
  if (c.trigger === 'manual') return undefined
  return compactInstructions({ trigger: c.trigger, base: await loadInstructions(io), facts: await instructionFacts(io) })
}

/** A compaction you pressed Enter on, or the engine's own, has finished: the floor moves and the chip shows the result. */
export async function guardCompacted(io: GuardIo, r: Parameters<typeof noteCompacted>[1], trigger: string, messages: unknown): Promise<void> {
  const entry = await noteCompacted(io, r, trigger, textOf(messages))
  const after = entry.after ?? entry.before
  const pct = entry.recall ? Math.round((entry.recall.found / entry.recall.total) * 100) : undefined
  gDone = { before: entry.before, after, saving: savingPerRequest(entry.before) - savingPerRequest(after), recall: pct }
  gPhase = 'done'
  gFailed = undefined
  await refreshGuard(io)
}

// The context guard's logic, kept apart from the drawing so it can be tested alone. Pure functions only:
// nothing here reads the engine, the clock or a file.

export type Mode = 'off' | 'advise'
export type Chip = 'none' | 'dim' | 'advise' | 'stopped'
export type Grade = 'good' | 'ok'

export type GuardConfig = {
  mode: Mode
  /** Tokens: the dim chip shows from here. */
  dimAt: number
  /** Tokens: the advice and its buttons start here. */
  adviseAt: number
  /** The advice also needs the context this far above the floor, so a big attachment cannot cause an instant second compaction. */
  minGrowth: number
  cooldownRequests: number
  cooldownMs: number
}

export const DEFAULTS: GuardConfig = {
  mode: 'advise',
  dimAt: 200_000,
  adviseAt: 300_000,
  minGrowth: 150_000,
  cooldownRequests: 8,
  cooldownMs: 20 * 60_000,
}

/** About what a session holds right after a compaction: the system part (about 107K) and a short summary. */
export const AFTER_TOKENS = 120_000
/** Dollars per cached token read, fitted to the user's own cost records (about $0.21 per million). */
const READ_PRICE = 0.21e-6
/** A fresh session's floor, until a compaction says what it really is. */
const DEFAULT_FLOOR = 120_000
const NO_COOLDOWN = 1_000_000

export type GuardState = {
  /** The context's size right after the last compaction (or a fresh session's baseline). */
  floor: number
  lastCompactAt?: number
  requestsSinceCompact: number
  /** Compactions in a row that did not shrink the context by a fifth. */
  shrinkFailures: number
}

export type TurnFacts = {
  now: number
  ctx: number
  /** A turn is running: nothing can be offered, and the engine rejects a compaction. */
  isWorking: boolean
  /** Background shells, monitors and subagents still running. The chip says so; it does not hold the advice back. */
  jobs: number
  /** The turn that just ended ran a successful git commit or push. */
  lastTurnCommitted: boolean
  /** Files this session changed that git still shows as uncommitted. */
  uncommittedMine: number
}

export type Decision = {
  chip: Chip
  grade?: Grade
  /** Why a chip is dim or stopped: growth, cooldown, no-shrink. */
  reason?: string
  /** Dollars saved per later request if it compacted now. */
  saving: number
}

export function initialState(): GuardState {
  return { floor: DEFAULT_FLOOR, requestsSinceCompact: NO_COOLDOWN, shrinkFailures: 0 }
}

export function savingPerRequest(ctx: number): number {
  return Math.max(0, ctx - AFTER_TOKENS) * READ_PRICE
}

export function decide(cfg: GuardConfig, st: GuardState, f: TurnFacts): Decision {
  const saving = savingPerRequest(f.ctx)
  const quiet = (chip: Chip, reason?: string): Decision => ({ chip, reason, saving })
  if (cfg.mode === 'off' || f.isWorking || f.ctx < cfg.dimAt) return quiet('none')
  const floorLine = st.floor + cfg.minGrowth
  const adviseLine = Math.max(cfg.adviseAt, floorLine)
  if (f.ctx < adviseLine) return quiet('dim', f.ctx >= cfg.adviseAt ? 'growth' : undefined)
  if (st.shrinkFailures >= 2) return quiet('stopped', 'no-shrink')
  const isCooling = st.requestsSinceCompact < cfg.cooldownRequests || (st.lastCompactAt !== undefined && f.now - st.lastCompactAt < cfg.cooldownMs)
  if (isCooling) return quiet('dim', 'cooldown')
  const grade: Grade = f.lastTurnCommitted && f.uncommittedMine === 0 ? 'good' : 'ok'
  return { chip: 'advise', grade, saving }
}

export function afterCompact(_cfg: GuardConfig, st: GuardState, r: { before: number; after?: number; now: number }): GuardState {
  const next: GuardState = { ...st, lastCompactAt: r.now, requestsSinceCompact: 0 }
  if (r.after === undefined) return next
  next.floor = r.after
  next.shrinkFailures = r.after > r.before * 0.8 ? st.shrinkFailures + 1 : 0
  return next
}

export function countRequest(st: GuardState): GuardState {
  return { ...st, requestsSinceCompact: st.requestsSinceCompact + 1 }
}

/** True when a shell command runs a git commit or push (not a dry run, not a mention in a string). */
export function isCommitCall(command: string): boolean {
  for (const seg of command.split(/&&|\|\||[;\n|]/)) {
    const s = seg.trim()
    if (/^git(?:\s+-C\s+\S+)?\s+(?:commit|push)(?:\s|$)/.test(s) && !/--dry-run\b/.test(s)) return true
  }
  return false
}

// ── the pilot log: one line per decision ──────────────────────────────────────

export type DecisionLog = {
  ts: number
  /** Local time of day, HH:MM:SS. */
  at: string
  project: string
  mode: Mode
  ctx: number
  window: number
  chip: Chip
  grade?: Grade
  reason?: string
  /** The compact buttons were on offer. */
  advised: boolean
  /** Dollars per later request that compacting now would have saved. */
  saving: number
  floor: number
  jobs: number
  mine: number
  committed: boolean
}

/** A turn end that moved the context and left the guard something to say, and not the size already logged. */
export function shouldLogDecision(o: { changedContext: boolean; chip: Chip; ctx: number; lastCtx?: number }): boolean {
  return o.changedContext && o.chip !== 'none' && o.ctx !== o.lastCtx
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** The local date, as the journal's day folders name it. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** guard/<day>/<session>.jsonl beside the board's own files: a sibling of the journal's log/, never inside it. */
export function logPath(dir: string, ms: number, session: string): string {
  return `${logDir(dir, ms)}/${session.replace(/[^A-Za-z0-9_-]/g, '_')}.jsonl`
}

/** The folder one day's files sit in: guard/<day>, every session's file of that day. */
export function logDir(dir: string, ms: number): string {
  return `${dir.replace(/[\\/]+$/, '')}/guard/${dayKey(ms)}`
}

/** One line, no newline at its end. The saving is rounded to four places; an empty grade or reason is left out. */
export function formatDecision(d: DecisionLog): string {
  return JSON.stringify({
    ts: d.ts,
    at: d.at,
    project: d.project,
    mode: d.mode,
    ctx: d.ctx,
    window: d.window,
    chip: d.chip,
    grade: d.grade,
    reason: d.reason,
    advised: d.advised,
    saving: Math.round(d.saving * 10_000) / 10_000,
    floor: d.floor,
    jobs: d.jobs,
    mine: d.mine,
    committed: d.committed,
  })
}

/** Day folders older than `keepDays`, from names that are dates and nothing else. */
export function expiredDays(names: string[], now: number, keepDays: number): string[] {
  const cutoff = now - keepDays * 86_400_000
  return names.filter(n => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) return false
    const at = Date.parse(`${n}T00:00:00`)
    return Number.isFinite(at) && at < cutoff
  })
}

/** What one day's log holds, for the Context tab's line. */
export type DaySummary = { logged: number; advised: number; saving: number }

/**
 * Reads the text of the day's files, every session's. A decision is a line that parses to an object with a number
 * for ctx; a blank line, a half-written one or one from another tool is skipped. The saving is summed over the
 * advised decisions only, and rounded to four places. A `would_compact` field in an older line is ignored.
 */
export function summarizeDay(texts: string[]): DaySummary {
  let logged = 0
  let advised = 0
  let saving = 0
  for (const text of texts) {
    for (const raw of text.split('\n')) {
      const l = raw.trim()
      if (l === '') continue
      let rec: unknown
      try {
        rec = JSON.parse(l)
      } catch {
        continue
      }
      if (typeof rec !== 'object' || rec === null) continue
      const d = rec as { ctx?: unknown; advised?: unknown; saving?: unknown }
      if (typeof d.ctx !== 'number') continue
      logged += 1
      if (d.advised !== true) continue
      advised += 1
      if (typeof d.saving === 'number' && Number.isFinite(d.saving)) saving += d.saving
    }
  }
  return { logged, advised, saving: Math.round(saving * 10_000) / 10_000 }
}

/** The line itself: decisions, how many had the buttons on offer, the saving per request summed over those. */
export function formatDay(s: DaySummary): string {
  if (s.logged === 0) return 'no decisions logged yet'
  return `${s.logged} ${s.logged === 1 ? 'decision' : 'decisions'} · ${s.advised} advised · $${s.saving.toFixed(2)} per request, summed`
}

// ── what the summary is told ──────────────────────────────────────────────────

export const DEFAULT_INSTRUCTIONS = `You are writing the notes the same assistant will use to carry on this work after its memory is cut. Write them for yourself, under 2,500 words, as these sections in this order.

1. Rules still in force. Quote the user's own words for every "do not", "don't commit", "wait for my yes" and "Approved:" gate, and for every correction they gave in this session. If there are none, write "none".

2. State. What is done, what is in flight, what is next, in order. For each job in flight: the command, its log file, and how to tell it has finished. Say which uncommitted files belong to this session and which to other sessions.

3. Identifiers, copied exactly and never reworded: full file paths; script names with the flags last used; study and learning numbers (for example 0095); Civitai post and image ids; 6-character picture ids; task ids (T-…); commit hashes; ports and PIDs; model, checkpoint and LoRA file names; URLs the user pasted.

4. Decisions and rejections, each with its reason in one line (for example "RedCraft 4.0 dropped: terrible output").

5. Open questions the user has not answered, and anything promised but not yet shown.

6. Verify first. Three to five facts to re-check before acting: a file exists, a job is alive, the branch is clean.

Leave out: raw tool output, command logs, file contents (give the path instead), descriptions of images already acted on, abandoned drafts (keep only the latest), and your own reasoning.`

export type InstructionFacts = {
  ctx: number
  branch?: string
  lastCommit?: string
  uncommitted: string[]
  jobs: string[]
  agents: string[]
  assumptions: string[]
}

const LIST_CAP = 20

/**
 * The text for `session.compact`, or undefined to leave the compaction exactly as it was asked.
 * A `/compact` you press Enter on (typed by hand, or filled by a button) is never changed: a bare one is a plain
 * compact and the words after it are yours. Only the engine's own late compaction (and a precompute) gets the
 * recipe, because nobody types those.
 */
export function compactInstructions(o: {
  trigger: 'manual' | 'auto' | 'plugin' | 'precompute'
  base: string
  facts: InstructionFacts
}): string | undefined {
  if (o.trigger === 'manual') return undefined
  const f = o.facts
  const lines: string[] = ['Facts from the session board (trust these over memory):']
  lines.push(`• Context before compaction: ${fmtK(f.ctx)}${f.branch ? ` · branch ${f.branch}` : ''}${f.lastCommit ? ` · last commit ${f.lastCommit}` : ''}`)
  const list = (title: string, items: string[]) => {
    if (items.length === 0) {
      lines.push(`• ${title}: none`)
      return
    }
    lines.push(`• ${title}:`)
    for (const x of items.slice(0, LIST_CAP)) lines.push(`  - ${x}`)
    if (items.length > LIST_CAP) lines.push(`  … and ${items.length - LIST_CAP} more`)
  }
  list('Uncommitted files from this session', f.uncommitted)
  list('Background jobs', f.jobs)
  lines.push(`• Subagents running: ${f.agents.length > 0 ? f.agents.join(', ') : 'none'}`)
  lines.push(`• Assumptions still open: ${f.assumptions.length > 0 ? f.assumptions.join(', ') : 'none'}`)
  return `${o.base}\n\n${lines.join('\n')}`
}

// ── the picker: the /compact command the mod types for you ─────────────────────
// The mod only types this into the prompt box. You read it, change it if you like, and press Enter.

export type PickId = 'notes' | 'lean' | 'tasks' | 'files' | 'jobs' | 'assumptions'
export type Picks = Record<PickId, boolean>

/** What the board offers to keep. The numbers of assumptions come from the assumptions mod, which shares counts only. */
export type PickFacts = { tasks: string[]; files: string[]; jobs: string[]; assumptions: number; high: number }

/** The rows of the picker, in the order their sentences appear in the command. */
export const PICK_ORDER: PickId[] = ['notes', 'lean', 'tasks', 'files', 'jobs', 'assumptions']

/** The first two start ticked; the rest start off. */
export const DEFAULT_PICKS: Picks = { notes: true, lean: true, tasks: false, files: false, jobs: false, assumptions: false }

export const NOTES_SENTENCE =
  'Write the notes in six parts: rules I gave (quote my words), state, identifiers copied exactly, decisions with reasons, open questions, facts to verify first.'
export const LEAN_SENTENCE = 'Leave out raw tool output and logs.'

const TASK_CAP = 8
const LIST_CAP_PICK = 20
const TASK_CHARS = 80
const ITEM_CHARS = 120

/** One line: control characters and line breaks become a space, runs of spaces fold, and a long item is cut. */
export function cleanItem(s: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  const one = s.replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim()
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`
}

/** "a, b and 3 more": the first `cap` items, then how many were left out. */
function listText(items: string[], cap: number, max: number, sep: string): string {
  const shown = items.slice(0, cap).map(x => cleanItem(x, max)).filter(x => x !== '')
  const more = items.length - cap
  return `${shown.join(sep)}${more > 0 ? ` and ${more} more` : ''}`
}

/** How many things a row would keep; a row with none cannot be ticked. */
export function pickCount(id: PickId, facts: PickFacts): number {
  switch (id) {
    case 'tasks':
      return facts.tasks.length
    case 'files':
      return facts.files.length
    case 'jobs':
      return facts.jobs.length
    case 'assumptions':
      return facts.assumptions
    default:
      return 1
  }
}

function sentenceFor(id: PickId, facts: PickFacts): string {
  if (pickCount(id, facts) === 0) return ''
  // A list whose items all came out empty (a line break and nothing else) says nothing, so it adds no sentence.
  const withList = (lead: string, text: string): string => (text === '' ? '' : `${lead}${text}.`)
  switch (id) {
    case 'notes':
      return NOTES_SENTENCE
    case 'lean':
      return LEAN_SENTENCE
    case 'tasks':
      return withList('Keep in full detail: the open items of the task list: ', listText(facts.tasks, TASK_CAP, TASK_CHARS, '; '))
    case 'files':
      return withList('Keep these uncommitted files by path: ', listText(facts.files, LIST_CAP_PICK, ITEM_CHARS, ', '))
    case 'jobs':
      return withList('Jobs still running: ', listText(facts.jobs, LIST_CAP_PICK, ITEM_CHARS, '; '))
    case 'assumptions':
      return `Assumptions still open: ${facts.assumptions}${facts.high > 0 ? ` (${facts.high} high impact)` : ''}.`
  }
}

/**
 * The command the picker types. Nothing ticked (or only rows with nothing to keep) is a bare `/compact`.
 * It is one line: no line breaks or control characters, however odd a path or a task subject is.
 */
export function buildCompactCommand(picks: Picks, facts: PickFacts): string {
  const sentences = PICK_ORDER.filter(id => picks[id]).map(id => sentenceFor(id, facts)).filter(s => s !== '')
  return sentences.length === 0 ? '/compact' : `/compact ${sentences.join(' ')}`
}

/** The buttons that type may replace the box only when it is empty or still holds what they typed last. */
export function boxIsFree(box: string, lastFilled: string | undefined): boolean {
  return box.trim() === '' || (lastFilled !== undefined && box === lastFilled)
}

// ── recall: how much of what mattered the new summary kept ────────────────────

const FILE_RX = /[\w.\-]+\.(?:py|md|json|html|mjs|js|ts|tsx|sh|ps1|yaml|yml|png|jpg|safetensors|log|txt|csv)\b/gi
const PORT_RX = /:(\d{4,5})\b/g
const POST_RX = /\b\d{8,9}\b/g
const STUDY_RX = /\b0\d{3}\b/g
const HASH_RX = /\b[0-9a-f]{8}\b/g

function identifiers(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(FILE_RX)) out.add(m[0].toLowerCase())
  for (const m of text.matchAll(PORT_RX)) out.add(m[1]!)
  for (const m of text.matchAll(POST_RX)) out.add(m[0])
  for (const m of text.matchAll(STUDY_RX)) out.add(m[0])
  for (const m of text.toLowerCase().matchAll(HASH_RX)) if (/\d/.test(m[0]) && /[a-f]/.test(m[0])) out.add(m[0])
  return out
}

/** Of the file names, ports, post ids, study numbers and hashes in `before`, how many appear in `summary`. */
export function recall(before: string, summary: string): { found: number; total: number; missing: string[] } {
  const ids = identifiers(before)
  const s = summary.toLowerCase()
  const missing = [...ids].filter(id => !s.includes(id))
  return { found: ids.size - missing.length, total: ids.size, missing }
}

// ── small formatters ──────────────────────────────────────────────────────────

export function fmtK(tokens: number): string {
  if (tokens >= 999_500) return `${(tokens / 1_000_000).toFixed(1)}M`
  return `${Math.round(tokens / 1000)}K`
}

const GLYPHS = '▁▂▃▄▅▆▇█'

/** One glyph per turn by size; a bar before a turn whose context fell to under 60% of the one before (a compaction). */
export function sparkWithMarks(values: number[], max: number): string {
  let out = ''
  values.forEach((v, i) => {
    if (i > 0 && v < values[i - 1]! * 0.6) out += '│'
    const idx = max > 0 ? Math.min(7, Math.max(0, Math.round((v / max) * 7))) : 0
    out += GLYPHS[idx]
  })
  return out
}

// ── config ────────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') return Number(v)
  return Number.NaN
}

/** The mode a stored or configured value stands for. The old `auto` (removed in 0.19.0) reads as `advise`. */
export function parseMode(v: unknown): Mode {
  return v === 'off' ? 'off' : 'advise'
}

/** The plugin's userConfig values, checked; thresholds arrive in thousands of tokens. Settings that no longer exist are ignored. */
export function parseConfig(o: Record<string, unknown>): GuardConfig {
  const adviseK = num(o.adviseAtK)
  const adviseAt = Number.isFinite(adviseK) && adviseK >= 100 ? Math.round(adviseK * 1000) : DEFAULTS.adviseAt
  return { ...DEFAULTS, mode: parseMode(o.mode), adviseAt }
}

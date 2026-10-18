import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelCompleteResult, Register, RenderElement } from 'claude-code'

import type { DraftedCommand, GrammarCard } from '../types'
import { EFFORT, MAX_TOKENS, MODEL, SYSTEM, TIMEOUT_MS, eligible, frame, label, parseCheck, review, rows } from './grammar'
import type { Check, Seg } from './grammar'
import { GOAL_LIMIT, lintGoal, lintLoop, userOnlyName } from './lint'

// `++` makes no extra model call: each feature attaches a short instruction to
// your own prompt, and the session's Claude, with everything it already has
// loaded, does the work in the same turn. Claude labels the parts of its draft
// so the card can show each one, and flag what is missing.
//
// `==` (and /grammar) is the one exception, and it can be switched off in
// /config: one small Haiku call that checks only your grammar. The prompt is
// never sent to Claude, so the correction never enters the conversation.

const ready = atom({ plugin: 'prompt-enhancer', key: 'ready' } as const, null)
const drafting = atom({ plugin: 'prompt-enhancer', key: 'drafting' } as const, null)
const grammar = atom({ plugin: 'prompt-enhancer', key: 'grammar' } as const, null)

type Kind = 'brief' | 'goal' | 'loop'

// How many turns a draft may take (clarifying questions, then the draft).
// Guided rounds can run over several turns when answers come back as prompts.
const DRAFT_TURNS = 6
// /goal accepts up to 4,000 characters; a good goal or loop is far shorter.
// 600 leaves room for the cap clause (about 230 characters) and a quoted baseline on top of the
// end state: at 500, a third of tested drafts ran over, and the clipped ones dropped part of the cap.
const MAX = 600

/** The labelled parts each kind of draft should have: label, icon, and whether it is required. */
const PARTS: Record<Kind, { label: string; icon: string; required: boolean; missing: string }[]> = {
  brief: [
    { label: 'goal', icon: '🎯', required: true, missing: 'no goal stated' },
    { label: 'scope', icon: '📐', required: true, missing: 'scope not stated' },
    { label: 'constraints', icon: '🚧', required: false, missing: '' },
    { label: 'done', icon: '✅', required: true, missing: 'no way to tell it is done' },
  ],
  goal: [
    { label: 'end', icon: '🎯', required: true, missing: 'no measurable end state' },
    { label: 'check', icon: '✅', required: true, missing: 'no check that proves it' },
    { label: 'keep', icon: '🚧', required: false, missing: '' },
    { label: 'limit', icon: '⏱', required: true, missing: 'no printed turn cap' },
  ],
  loop: [
    { label: 'every', icon: '⏱', required: false, missing: '' },
    { label: 'check', icon: '🔍', required: true, missing: 'nothing to check' },
    { label: 'if', icon: '↪', required: true, missing: 'no action for the results' },
    { label: 'stop', icon: '🛑', required: true, missing: 'no stop condition' },
    { label: 'never', icon: '🚫', required: false, missing: '' },
  ],
}

const NAMES: Record<string, string> = {
  goal: 'Goal',
  scope: 'Scope',
  constraints: 'Constraints',
  done: 'Done when',
  end: 'End state',
  check: 'Check',
  keep: 'Keep',
  limit: 'Limit',
  every: 'Every',
  if: 'If … then',
  stop: 'Stop when',
  never: 'Never',
}

const CHECK_FIRST = (what: string) =>
  `Check my request for anything unclear, missing or ambiguous that would change the result: ${what}. If something matters, ask me (AskUserQuestion, at most 4 questions, multiple choice where possible). Skip what I already said.`

/**
 * For /goal and /loop: I may not know how to write one, so Claude walks me
 * through every required part, round after round, before it drafts anything.
 */
const GUIDE = (cmd: string, parts: string) =>
  `Guide me through it: I may be new to ${cmd}. Its required parts are: ${parts}. For each part my request does not already make clear, ask me with AskUserQuestion (at most 4 questions per round). Make every option a concrete, ready-to-use value with one short line on what it means; put the one you recommend first, marked (Recommended). If my answers leave a part open or raise a new gap, ask another round. At most 3 rounds: if a part is still open after that, pick the safest choice and name it in your reply. Do not draft until every required part is settled.`

const CLARIFY = `Before doing any work on my request above:
1. ${CHECK_FIRST('the goal, the scope, the constraints, and how we will know it is done')}
2. Then restate the task as a short brief, under 120 words, in a fenced code block tagged brief, one line per part:
goal: …
scope: … (what is in and what is out)
constraints: … (or "none")
done: … (how we will know it is done)
Do not start the work in this turn; wait for my go-ahead or my corrections.`

/**
 * The goal's cap, as tested on Claude Code 2.1.302 (2026-10-18). Nothing counts turns for Claude
 * or the judge, so Claude prints the count itself. It is an either/or on purpose: written as
 * "… or done when a reply ends GOAL CAPPED", the judge kept demanding the end state and accepted
 * the cap in 1 of 3 runs; written as below it accepted the cap in 4 of 4 runs that reached it,
 * each time right after the K-th message, and refused an early fake cap (2 of 2).
 */
const CAP = (k: string) =>
  `or (B) after ${k} "Stop hook feedback" messages, a reply ends "GOAL CAPPED: <what is left>". Either one alone ends the goal. End each reply with "Goal turn N/${k}" (N = those messages + 1).`

/** What part (A) of a goal must hold, shared by ++goal and a loop request that is really a goal. */
const GOAL_RULES = `In (A): one end state that command output shows (an exit code, a count, an empty list), the check run after the last edit with its output quoted in the reply, and each constraint with the output that shows it ("git diff --stat lists only src/auth"). A before/after constraint ("count not below the start", "PID unchanged") saves its start value to a file first, and the final reply quotes that file beside the new value: the judge may not see early messages. A check script you write must be shown failing once on a deliberately broken input. When my request asks for quality or no gaps, file names or heading counts do not show it: add a check that does (a test, a read-back, or a fresh reviewer subagent's quoted verdict). No taste words ("production-ready", "looks good") and no clock deadline: the judge has no clock, only times printed in the chat. Copy the (B) sentence word for word, with your number in place of both Ks; leave <what is left> and N as they are.`

/** The reply shape the card reads for a goal. */
const GOAL_REPLY = `the condition alone in a fenced code block tagged goal, then its parts in a fenced code block tagged parts, one line each:
end: …
check: …
keep: … (or "none")
limit: … (K, the cap)`

const GOAL = `Help me turn my request above into a /goal condition. Do not start the work.
1. ${GUIDE('/goal', 'the end state, the check that proves it, what must not break, and K, how many "Stop hook feedback" messages (goal checks) to allow before it stops')} Among your questions, offer to run the check once now to see it fail; recommend that only when it is local, writes nothing and takes under 30 seconds.
2. Then write ONE condition, under ${MAX} characters. Its judge is a small model that runs nothing and reads only this conversation (in a long one, only the newest messages), so write it in exactly this shape:
Done when either: (A) <end state>; ${CAP('K')}
${GOAL_RULES}
3. Reply with one line saying what the goal does, then ${GOAL_REPLY}`

const LOOP = `Help me turn my request above into a /loop command. Do not start the work.
1. Route it first, in one line, when another tool fits better. "Keep working until X holds" is a /goal: ask me for K with your other questions, then draft a goal instead, under ${MAX} characters, shaped "Done when either: (A) <end state>; ${CAP('K')}". ${GOAL_RULES} Reply with one line saying what the goal does, then ${GOAL_REPLY}
"React when a log line, file or output appears" is a Monitor: give the one sentence I can type to start it, then draft the /loop as a fallback. Laptop off, or longer than 7 days, is /schedule, but only when the work needs no local files, browser or GPU: a routine runs in the cloud on a fresh clone.
2. ${GUIDE('/loop', 'what to check, how often (or self-paced), what to do with each result, when to stop, and what must never be touched')}
3. Then write ONE /loop line, under ${MAX} characters. The loop skill already runs it once now, paces it, and reports when it stops; add only what it lacks:
   - an interval first (5m, 30m, 2h) only for work on a clock (daily, hourly); for "until X happens" leave it out (self-paced), since a fixed interval runs until cancelled or 7 days;
   - what to check each pass, safe to repeat; for a list, one item per pass, tracked in a state file read first, 3 tries then mark it blocked;
   - what to do for each likely result, and "if nothing changed, say so in one line";
   - when to stop, as something the check shows;
   - "never push, delete or send" unless my request asked for it;
   - no user-only skill (disable-model-invocation: true): a loop pass gets it as plain text. If a step needs one, do not rebuild its steps: say in one line that I must type it myself, and leave that step out.
4. Reply with one line saying what the loop does, then everything after "/loop " alone in a fenced code block tagged loop, then its parts in a fenced code block tagged parts, one line each:
every: … (or "self-paced")
check: …
if: …
stop: …
never: … (or "none")`

const INSTRUCTION = { brief: CLARIFY, goal: GOAL, loop: LOOP } as const

/** The body of the first fenced block tagged `tag`, or null. */
function block(answer: string, tag: string): string | null {
  const m = answer.match(new RegExp('```' + tag + '[^\\n]*\\n([\\s\\S]*?)```'))
  const body = m?.[1]?.trim() ?? ''
  return body === '' ? null : body
}

/** "label: value" lines, in order; a line without a known label continues the previous value. */
function parseParts(body: string | null): { label: string; value: string }[] {
  if (body === null) return []
  const parts: { label: string; value: string }[] = []
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*([a-z ]+?)\s*:\s*(.*)$/i)
    const label = m?.[1]?.toLowerCase().trim()
    if (m && label !== undefined && label in NAMES) parts.push({ label, value: (m[2] ?? '').trim() })
    else if (parts.length > 0 && line.trim() !== '') parts[parts.length - 1]!.value += ` ${line.trim()}`
  }
  return parts
}

/** A draft in the answer: a goal or loop command, or a brief. */
function findDraft(answer: string): DraftedCommand | null {
  for (const kind of ['goal', 'loop'] as const) {
    const body = block(answer, kind)
    if (body !== null) {
      // No cut at /goal's limit: a cut can drop the cap clause at the end. The card flags it instead.
      return { kind, args: body.replace(/\s+/g, ' '), parts: parseParts(block(answer, 'parts')) }
    }
  }
  const brief = block(answer, 'brief')
  if (brief !== null) return { kind: 'brief', args: brief, parts: parseParts(brief) }
  return null
}

const isNone = (v: string) => /^(none|n\/a|-|—|nothing)\.?$/i.test(v.trim())

/** True when a drawing shows nothing (an empty box or blank text): such a tree only adds a blank row. */
function isBlank(n: unknown): boolean {
  if (n === null || n === undefined || n === false || n === true) return true
  if (typeof n === 'string') return n.trim() === ''
  if (typeof n === 'number') return false
  if (Array.isArray(n)) return n.every(isBlank)
  const el = n as { type?: unknown; children?: unknown[] }
  if (el.type === 'Box' || el.type === 'Text') return (el.children ?? []).every(isBlank)
  return false
}

/** How the check ended when the model gave no text. */
const whyFailed = (r: Exclude<ModelCompleteResult, { isAnswered: true }>) =>
  r.reason === 'api-error'
    ? `Could not check: ${r.error}${r.status ? ` (${r.status})` : ''}.`
    : r.reason === 'empty-reply'
      ? 'Could not check: the model sent no text.'
      : 'Could not check: it took too long.'

/** How each kind of stretch is drawn in the one-line diff. */
const SEG_STYLE: Record<Seg['kind'], { color?: string; bold?: boolean; strikethrough?: boolean; underline?: boolean }> = {
  same: {},
  del: { color: 'red', strikethrough: true },
  ins: { color: 'green', bold: true },
  held: { color: 'yellow', underline: true },
}

/** Skills a loop pass cannot run, read once per load from the project's and your own skill folders. */
let userOnly: string[] | null = null

/**
 * The names of the skills marked `disable-model-invocation: true`: a scheduled loop pass gets
 * those as plain text. Read when `++loop` is first used, not at session start.
 */
async function userOnlySkills($: EngineInterface): Promise<string[]> {
  if (userOnly !== null) return userOnly
  const root = await $.session.root().catch(() => null)
  const home =
    (await $.env.get('USERPROFILE').catch(() => undefined)) ?? (await $.env.get('HOME').catch(() => undefined)) ?? null
  const names = new Set<string>()
  let listed = 0
  // the same folder once, however its path is spelled (the session can run in the home folder)
  const bases: string[] = []
  for (const b of [root, home]) {
    const clean = b?.replace(/\\/g, '/').replace(/\/+$/, '')
    if (clean && !bases.some(x => x.toLowerCase() === clean.toLowerCase())) bases.push(clean)
  }
  for (const base of bases) {
    const dir = `${base}/.claude/skills`
    const entries = await $.fs.list(dir).catch(() => [])
    listed += entries.length
    // a folder, or a junction (which lists as `other`)
    const found = await Promise.all(
      entries
        .filter(e => e.kind !== 'file')
        .map(async e => {
          const md = await $.fs.read(`${dir}/${e.name}/SKILL.md`).catch(() => null)
          return typeof md === 'string' ? userOnlyName(md, e.name) : null
        }),
    )
    for (const n of found) if (n !== null) names.add(n)
  }
  const result = [...names].sort()
  // nothing could be listed: try again next time rather than remember "none"
  if (listed > 0) userOnly = result
  return result
}

/**
 * What the prompt box holds: `free` (empty, or only `mine`, text this mod put there, so a fill
 * wipes nothing of yours), `yours` (your own words), or `unknown` (it could not be read).
 */
async function boxState($: EngineInterface, mine?: string): Promise<'free' | 'yours' | 'unknown'> {
  const box = await $.prompt.read().catch(() => null)
  if (box === null) return 'unknown'
  const text = box.text.trim()
  return text === '' || (mine !== undefined && text === mine.trim()) ? 'free' : 'yours'
}

/** Puts a /clarify, /goalify or /loopify request in the prompt box as its prefix form, never over your own words. */
async function fillCommand($: EngineInterface, text: string) {
  if ((await boxState($)) === 'free') await $.prompt.fill({ text, mode: 'replace' }).catch(() => undefined)
  else $.ui.toast(`Your prompt box has text: type ${text.length > 40 ? `${text.slice(0, 39)}…` : text} yourself`)
}

/** Which check is current: a result from an older one is dropped. */
let seq = 0
let running: AbortController | null = null

/**
 * One check, in the background: ask the model, read the answer (one retry when it is not the
 * agreed JSON), review it, put the corrected text in the box when that is free, then show the card.
 */
async function check($: EngineInterface, text: string, typed: string[], mine: number, signal: AbortSignal) {
  const show = (card: GrammarCard) => (mine === seq ? update($, grammar, () => card) : undefined)
  try {
    let result: Check | null = null
    for (let attempt = 0; attempt < 2 && result === null; attempt++) {
      const r = await $.model.complete(
        { model: MODEL, system: SYSTEM, prompt: frame(text), effort: EFFORT, maxTokens: MAX_TOKENS, timeoutMs: TIMEOUT_MS },
        { signal },
      )
      if (mine !== seq) return
      if (!r.isAnswered) return void (await show({ status: 'failed', why: whyFailed(r) }))
      result = parseCheck(r.text)
    }
    if (result === null) return void (await show({ status: 'failed', why: 'Could not read the check result. Try again.' }))
    const reviewed = review(text, result)
    if (reviewed.applied > 0) {
      const box = await $.prompt.read()
      if (mine !== seq) return
      const isFree = box.text.trim() === '' || typed.includes(box.text.trim())
      const filled = isFree ? await $.prompt.fill({ text: reviewed.text, mode: 'replace' }).catch(() => undefined) : undefined
      $.ui.toast(filled?.isFilled ? 'Corrected text is in the prompt box: check it, then Enter' : 'Grammar check ready: use "Put in box" on the card')
    }
    await show({ status: 'done', review: reviewed })
  } catch {
    await Promise.resolve(show({ status: 'failed', why: 'Could not check: something went wrong.' })).catch(() => undefined)
  }
}

/** Starts a check. Returns why it did not start, or null when it is under way. */
async function begin($: EngineInterface, text: string, typed: string): Promise<string | null> {
  const ok = eligible(text)
  if (!ok.ok) return ok.why
  const mine = ++seq
  running?.abort()
  running = new AbortController()
  await update($, grammar, () => ({ status: 'checking' as const, original: text }))
  void check($, text, [text, `== ${text}`, `/grammar ${text}`, typed.trim()], mine, running.signal)
  return null
}

/** Closes the card, and ignores a check that is still running. */
const dismiss = ($: EngineInterface) => {
  seq++
  running?.abort()
  return update($, grammar, () => null)
}

export const register: Register = (on, options) => {
  const grammarOn = options.grammar !== 'off'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'grammar',
      description: 'Check only the grammar of your text with one small Haiku call (same as ==). Nothing is sent to Claude',
      argumentHint: '<your text>',
    })
    await $.command.register({
      name: 'clarify',
      description: 'Check a request for gaps and restate it as a brief before any work (same as ++)',
      argumentHint: '<request>',
    })
    await $.command.register({
      name: 'goalify',
      description: 'Check a request for gaps, then draft a short, checkable /goal (same as ++goal or ++g)',
      argumentHint: '<request>',
    })
    await $.command.register({
      name: 'loopify',
      description: 'Check a request for gaps, then draft a safe, self-stopping /loop (same as ++loop or ++l)',
      argumentHint: '<request>',
    })
    return next(e)
  })

  // "++goal …", "++loop …" or "++ …": attach the instruction, send the request as you wrote it.
  on('prompt.submit', async ($, e, next) => {
    const isYours =
      e.origin.kind === 'composer' || (e.origin.kind === 'plugin' && e.origin.name === 'prompt-enhancer')
    if (!isYours) return next(e)
    const text = e.text.trimStart()
    // "== …": check the grammar only. The prompt is consumed here and never reaches Claude.
    if (grammarOn && /^==(\s|$)/.test(text)) {
      const request = text.slice(2).trim()
      if (request === '') return { drop: 'Type your text after ==, for example: == i dont know why it fail' }
      const why = await begin($, request, e.text)
      return { drop: why ?? 'Checking your grammar. Nothing is sent to Claude.' }
    }
    if (!text.startsWith('++')) {
      // Your next prompt after a brief (a go-ahead or a correction) settles its card.
      if (e.origin.kind === 'composer' && (await read($, ready))?.kind === 'brief') await update($, ready, () => null)
      return next(e)
    }
    // "++goal" / "++loop", or the short "++g" / "++l": the letter right after "++" and then a space,
    // so "++ go ahead" and "++loose ideas" stay ordinary briefs.
    const m = text.match(/^\+\+(?:\s*(goal|loop)\b[:\s]*|([gl])(?:\s+|$))/i)
    const word = (m?.[1] ?? m?.[2])?.toLowerCase()
    const kind: Kind = word === undefined ? 'brief' : word.startsWith('g') ? 'goal' : 'loop'
    const request = text.slice(m ? m[0].length : 2).trim()
    if (request === '') return next(e)
    await update($, drafting, () => ({ kind, turnsLeft: DRAFT_TURNS }))
    await update($, ready, () => null)
    let instruction: string = INSTRUCTION[kind]
    if (kind !== 'brief') {
      const names = await userOnlySkills($).catch(() => [])
      if (names.length > 0) {
        instruction += `\nUser-only skills here (Claude cannot call them, and a loop pass gets them as plain text): ${names.map(n => `/${n}`).join(', ')}. If a step needs one, do not rebuild its steps: say in one line that I must type it myself, and leave that step out.`
      }
    }
    return next({ ...e, text: request, context: [...(e.context ?? []), instruction] })
  }).catch(($, e, next) => next(e)) // never block your prompt

  for (const [name, prefix, also] of [
    ['clarify', '++', ''],
    ['goalify', '++goal', ' (or ++g)'],
    ['loopify', '++loop', ' (or ++l)'],
  ] as const) {
    on('command.run', { command: name }, async ($, e) => {
      const request = e.args.trim()
      if (request === '') return { text: `Usage: /${name} <request>, or start a prompt with ${prefix}${also}` }
      // A command cannot submit a prompt (it would wait on its own turn), and a prompt this mod
      // submits skips this mod's own hook, so the instruction would never attach. So the request
      // goes into the prompt box as "++goal …", just after the box clears, and you press Enter.
      $.clock.after(50, () => void fillCommand($, `${prefix} ${request}`))
      return { text: `"${prefix} ${request.length > 40 ? `${request.slice(0, 39)}…` : request}" goes in the prompt box: press Enter to start` }
    })
  }

  on('command.run', { command: 'grammar' }, async ($, e) => {
    if (!grammarOn) return { text: 'The grammar check is off. Turn it on in /config (Grammar check).' }
    const text = e.args.trim()
    if (text === '') return { text: 'Usage: /grammar <your text>, or start a prompt with ==' }
    const why = await begin($, text, `/grammar ${text}`)
    return { text: why ?? 'Checking your grammar. Nothing is sent to Claude.' }
  })

  // While a draft is on its way, catch it when a turn ends.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const d = await read($, drafting)
    if (d === null || e.agentId !== undefined) return result
    // A loop request may come back as a goal when that fits better: take either.
    const found = findDraft(e.answer)
    if (found !== null) {
      await update($, drafting, () => null)
      // the card checks a goal or loop against the user-only skills: know them before it draws
      if (found.kind !== 'brief' && userOnly === null) await userOnlySkills($).catch(() => [])
      await update($, ready, () => found)
      if (found.kind !== 'brief') {
        // Only into an empty box: what you typed while Claude drafted stays.
        const box = await boxState($)
        const filled =
          box === 'free'
            ? await $.prompt.fill({ text: `/${found.kind} ${found.args}`, mode: 'replace' }).catch(() => undefined)
            : undefined
        $.ui.toast(
          filled?.isFilled
            ? `/${found.kind} ready in the prompt box: check it, then Enter`
            : box === 'yours'
              ? `/${found.kind} ready above the prompt; your typing was left in the box`
              : `/${found.kind} ready above the prompt`,
        )
      }
    } else {
      await update($, drafting, v => (v === null || v.turnsLeft <= 1 ? null : { ...v, turnsLeft: v.turnsLeft - 1 }))
    }
    return result
  }).catch(($, e, next) => next(e))

  // The card: the draft's parts in labelled rows, gaps flagged, and the actions.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, ready)
    if (r === null || e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const kind = r.kind
    const accent = kind === 'brief' ? 'blue' : 'cyan'
    const title = kind === 'brief' ? ' 📋 BRIEF ' : kind === 'goal' ? ' ◎ GOAL READY ' : ' ↻ LOOP READY '
    const width = Math.max(30, e.props.bodyColumns - 6)
    const labelWidth = 12

    const byLabel = new Map(r.parts.map(p => [p.label, p.value]))
    const rows: RenderElement[] = []
    const gaps: string[] = []
    for (const spec of PARTS[kind]) {
      const value = byLabel.get(spec.label)
      if (value === undefined || value === '' || (spec.required && isNone(value))) {
        if (spec.required) gaps.push(spec.missing)
        continue
      }
      if (isNone(value)) continue
      const name = `${spec.icon} ${NAMES[spec.label] ?? spec.label}`
      rows.push(
        <Text key={`pe-row-${spec.label}`} wrap="wrap">
          <Text bold color={accent}>
            {name.padEnd(labelWidth + 1)}
          </Text>
          <Text>{value.length > width - labelWidth ? `${value.slice(0, width - labelWidth - 1)}…` : value}</Text>
        </Text>,
      )
    }
    // What the judge or the loop could not use, read from the command text itself.
    if (kind === 'goal') gaps.push(...lintGoal(r.args, userOnly ?? []))
    if (kind === 'loop') gaps.push(...lintLoop(r.args, userOnly ?? []))
    const tooLong = kind === 'goal' && r.args.length > GOAL_LIMIT
    const cmd = `/${kind} ${r.args}`
    // No labelled parts at all (an older reply): show the text itself, at most a few lines of it.
    if (rows.length === 0) {
      rows.push(
        <Text key="pe-row-text" wrap="wrap">
          {r.args.length > 600 ? `${r.args.slice(0, 599)}…` : r.args}
        </Text>,
      )
    }

    const close = () => update($, ready, () => null)
    const actions =
      kind === 'brief' ? (
        <Box key="pe-actions" marginTop={1}>
          <Button
            key="pe-go"
            label="▶ Go"
            variant="primary"
            onPress={async () => {
              await close()
              await $.prompt.submit({ text: 'Go ahead with the brief above.', asUser: true })
            }}
          />
          <Text>  </Text>
          <Button
            key="pe-correct"
            label="✎ Correct"
            onPress={async () => {
              await close()
              await $.prompt.fill({ text: 'Correction to the brief: ', mode: 'replace' }).catch(() => undefined)
            }}
          />
          <Text>  </Text>
          <Button key="pe-dismiss" label="Dismiss" role="dismiss" onPress={close} />
        </Box>
      ) : (
        <Box key="pe-actions" marginTop={1}>
          {!tooLong && (
            <Button
              key="pe-start"
              label={kind === 'goal' ? '▶ Start goal' : '▶ Start loop'}
              variant="primary"
              onPress={async () => {
                const box = await boxState($, cmd)
                // you edited the draft in the box: that version is the one to start, with Enter
                if (box === 'yours') {
                  const typed = (await $.prompt.read().catch(() => null))?.text.trim() ?? ''
                  if (typed.startsWith(`/${kind} `)) return void $.ui.toast(`Your edited /${kind} is in the box: press Enter to start it`)
                }
                await close()
                // clear the box only when it holds this draft, never your own words
                if (box === 'free') await $.prompt.fill({ text: '', mode: 'replace' }).catch(() => undefined)
                await $.command.run({ command: kind, args: r.args }).catch(async () => {
                  await update($, ready, () => r)
                  $.ui.toast(`Could not start the /${kind}: the draft is back above the prompt`)
                })
              }}
            />
          )}
          {!tooLong && <Text>  </Text>}
          <Button
            key="pe-edit"
            label="✎ Edit in box"
            onPress={async () => {
              const box = await boxState($, cmd)
              if (box === 'free') await $.prompt.fill({ text: cmd, mode: 'replace' }).catch(() => undefined)
              else if (box === 'yours') $.ui.toast('Your prompt box has text: clear it, then press ✎ Edit again')
              else $.ui.toast('Could not read the prompt box: copy the draft from the card')
            }}
          />
          <Text>  </Text>
          <Button key="pe-dismiss" label="Dismiss" role="dismiss" onPress={close} />
        </Box>
      )
    // What every goal or loop card should say once, dim: how the command really behaves.
    const footer =
      kind === 'goal'
        ? 'the judge reads only this chat · a reached cap also counts as achieved'
        : kind === 'loop'
          ? 'runs only while this session is open and idle · ends after 7 days'
          : null

    const mine = (
      <Box key="pe-ready" flexDirection="column" borderStyle="round" borderColor={gaps.length > 0 ? 'yellow' : accent} paddingX={1}>
        <Box>
          <Text bold color="black" backgroundColor={accent}>
            {title}
          </Text>
          <Text dimColor>{kind === 'brief' ? '  nothing starts until you say go' : `  /${kind} · ${r.args.length} chars`}</Text>
        </Box>
        {rows}
        {gaps.map(g => (
          <Text key={`pe-gap-${g}`} color="yellow" wrap="wrap">
            ⚠ {g}
          </Text>
        ))}
        {footer !== null && (
          <Text key="pe-footer" dimColor wrap="wrap">
            {footer}
          </Text>
        )}
        {actions}
      </Box>
    )
    // Keep whatever else is drawn above the prompt (other mods' strips) beneath this one.
    const beneath = await next(e)
    return (
      <Box flexDirection="column">
        {mine}
        {!isBlank(beneath) && beneath}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // The grammar card: the one-line diff, a row per kind of fix, what was held back, and the actions.
  // It never says the text is fine: "No fixes found" only says this check found none.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const g = await read($, grammar)
    if (g === null || e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const done = g.status === 'done' ? g.review : null
    const count = done?.applied ?? 0
    const held = done?.held ?? 0
    const headline =
      done === null
        ? g.status === 'checking'
          ? 'checking…'
          : 'could not check'
        : count === 0
          ? 'No fixes found'
          : count === 1
            ? '1 fix found'
            : `${count} fixes found`
    const accent = g.status === 'failed' || held > 0 ? 'yellow' : 'green'

    const body: RenderElement[] = []
    if (g.status === 'failed') {
      body.push(
        <Text key="pe-g-why" color="yellow" wrap="wrap">
          {g.why}
        </Text>,
      )
    }
    if (done !== null) {
      // the whole text with the changes marked, while it is short enough to read in one glance
      if (done.original.length <= 500 && done.segments.some(s => s.kind !== 'same')) {
        body.push(
          <Text key="pe-g-line" wrap="wrap">
            {done.segments.map((s, i) => (
              <Text key={`pe-g-s${i}`} {...SEG_STYLE[s.kind]}>
                {`${s.text} `}
              </Text>
            ))}
          </Text>,
        )
      }
      const list = rows(done)
      list.slice(0, 8).forEach((row, i) => {
        body.push(
          row.applied ? (
            <Box key={`pe-g-row-${i}`} flexDirection="column">
              <Text wrap="wrap">
                <Text bold color={accent}>
                  {label(row.category).padEnd(15)}
                </Text>
                <Text>{`${row.del || '—'} → ${row.ins || '—'}`}</Text>
                {row.count > 1 && <Text dimColor>{` ×${row.count}`}</Text>}
              </Text>
              {row.why !== '' && (
                <Text dimColor wrap="wrap">
                  {`  ${row.why}`}
                </Text>
              )}
            </Box>
          ) : (
            <Box key={`pe-g-row-${i}`} flexDirection="column">
              <Text color="yellow" wrap="wrap">
                {`⚠ not applied  ${row.del} → ${row.ins || '(removed)'}`}
              </Text>
              <Text dimColor wrap="wrap">
                {'  It takes words out. Check it yourself.'}
              </Text>
            </Box>
          ),
        )
      })
      if (list.length > 8) {
        body.push(
          <Text key="pe-g-more" dimColor>
            {`+${list.length - 8} more`}
          </Text>,
        )
      }
      done.tips.slice(0, 3).forEach((t, i) => {
        body.push(
          <Text key={`pe-g-tip-${i}`} dimColor wrap="wrap">
            {`tip  ${t.before} → ${t.after} (not applied)`}
          </Text>,
        )
      })
    }

    const buttons: RenderElement[] = []
    if (done !== null && done.applied > 0) {
      buttons.push(
        <Button
          key="pe-g-box"
          label="✎ Put in box"
          variant="primary"
          onPress={() => $.prompt.fill({ text: done.text, mode: 'replace' }).catch(() => undefined)}
        />,
      )
      buttons.push(<Text key="pe-g-gap">  </Text>)
    }
    buttons.push(<Button key="pe-g-dismiss" label="Dismiss" role="dismiss" onPress={() => dismiss($)} />)

    const mine = (
      <Box key="pe-grammar" flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1}>
        <Box>
          <Text bold color="black" backgroundColor={accent}>
            {' ✎ GRAMMAR '}
          </Text>
          <Text bold>{`  ${headline}${held > 0 ? ` · ${held} not applied` : ''}`}</Text>
          <Text dimColor>{'  your text was not sent to Claude'}</Text>
        </Box>
        {body}
        <Box key="pe-g-actions" marginTop={1}>
          {buttons}
        </Box>
      </Box>
    )
    const beneath = await next(e)
    return (
      <Box flexDirection="column">
        {mine}
        {!isBlank(beneath) && beneath}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // Typing /goal or /loop yourself (from the filled box) also settles the card.
  for (const kind of ['goal', 'loop'] as const) {
    on('command.run', { command: kind }, async ($, e, next) => {
      if ((await read($, ready))?.kind === kind) await update($, ready, () => null)
      return next(e)
    }).catch(($, e, next) => next(e))
  }
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelCompleteResult, Register, RenderElement } from 'claude-code'

import type { DraftedCommand, GrammarCard } from '../types'
import { EFFORT, MAX_TOKENS, MODEL, SYSTEM, TIMEOUT_MS, eligible, frame, label, parseCheck, review, rows } from './grammar'
import type { Check, Seg } from './grammar'

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
const MAX = 400

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
    { label: 'limit', icon: '⏱', required: true, missing: 'no turn or time limit' },
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

const GOAL = `Help me turn my request above into a /goal condition. Do not start the work.
1. ${GUIDE('/goal', 'the end state, the check that proves it, the scope, what must not break, and a turn limit')}
2. Then write ONE condition, under ${MAX} characters, with:
   - one measurable end state (a test result, an exit code, a file count, an empty list);
   - the check that proves it, as something your own output will show (for example "npm test exits 0"), because the goal's judge only reads the conversation and runs nothing itself;
   - any constraint that must not break on the way;
   - a bound, such as "or stop after 15 turns".
3. Reply with one line saying what the goal does, then the condition alone in a fenced code block tagged goal, then its parts in a fenced code block tagged parts, one line each:
end: …
check: …
keep: … (or "none")
limit: …`

const LOOP = `Help me turn my request above into a /loop command. Do not start the work.
1. If this is really "keep working until a condition holds", say /goal fits better and draft a goal instead (blocks tagged goal and parts, as for a goal: end, check, keep, limit). If it is "react when a log line or process output appears", say so: a Monitor fits better.
2. ${GUIDE('/loop', 'what to check, how often (or self-paced), what to do with each result, when to stop, and what must never be touched')}
3. Then write ONE /loop line, under ${MAX} characters:
   - an interval first (like 5m, 30m, 2h) only when the timing is known; leave it out to let Claude pace itself;
   - what to check each time, written so it is safe to repeat;
   - what to do for each likely result, and to report in one line when nothing changed;
   - when to stop: "when X, say so and stop the loop";
   - no irreversible step (push, delete, send) unless my request asked for it.
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
      return { kind, args: body.replace(/\s+/g, ' ').slice(0, 4000), parts: parseParts(block(answer, 'parts')) }
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
      description: 'Check a request for gaps, then draft a short, checkable /goal (same as ++goal)',
      argumentHint: '<request>',
    })
    await $.command.register({
      name: 'loopify',
      description: 'Check a request for gaps, then draft a safe, self-stopping /loop (same as ++loop)',
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
    const m = text.match(/^\+\+\s*(goal|loop)\b[:\s]*/i)
    const kind: Kind = m ? (m[1]!.toLowerCase() as 'goal' | 'loop') : 'brief'
    const request = text.slice(m ? m[0].length : 2).trim()
    if (request === '') return next(e)
    await update($, drafting, () => ({ kind, turnsLeft: DRAFT_TURNS }))
    await update($, ready, () => null)
    return next({ ...e, text: request, context: [...(e.context ?? []), INSTRUCTION[kind]] })
  }).catch(($, e, next) => next(e)) // never block your prompt

  for (const [name, prefix, says] of [
    ['clarify', '++', 'Checking your request for gaps…'],
    ['goalify', '++goal', 'Walking you through each part of the /goal, then drafting it…'],
    ['loopify', '++loop', 'Walking you through each part of the /loop, then drafting it…'],
  ] as const) {
    on('command.run', { command: name }, async ($, e) => {
      if (e.args.trim() === '') return { text: `Usage: /${name} <request>, or start a prompt with ${prefix}` }
      void $.prompt.submit({ text: `${prefix} ${e.args.trim()}`, asUser: true })
      return { text: says }
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
      await update($, ready, () => found)
      if (found.kind !== 'brief') {
        const filled = await $.prompt.fill({ text: `/${found.kind} ${found.args}`, mode: 'replace' }).catch(() => undefined)
        $.ui.toast(
          filled?.isFilled
            ? `/${found.kind} ready in the prompt box: check it, then Enter`
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
    // No labelled parts at all (an older reply): show the text itself.
    if (rows.length === 0) {
      rows.push(
        <Text key="pe-row-text" wrap="wrap">
          {r.args}
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
          <Button
            key="pe-start"
            label={kind === 'goal' ? '▶ Start goal' : '▶ Start loop'}
            variant="primary"
            onPress={async () => {
              await close()
              await $.prompt.fill({ text: '', mode: 'replace' }).catch(() => undefined)
              await $.command.run({ command: kind, args: r.args })
            }}
          />
          <Text>  </Text>
          <Button
            key="pe-edit"
            label="✎ Edit in box"
            onPress={() => $.prompt.fill({ text: `/${kind} ${r.args}`, mode: 'replace' }).catch(() => undefined)}
          />
          <Text>  </Text>
          <Button key="pe-dismiss" label="Dismiss" role="dismiss" onPress={close} />
        </Box>
      )

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
          <Text key={`pe-gap-${g}`} color="yellow">
            ⚠ {g}
          </Text>
        ))}
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

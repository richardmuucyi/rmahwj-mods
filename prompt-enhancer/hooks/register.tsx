import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelCompleteResult, Register, RenderElement } from 'claude-code'

import type { DraftedCommand, GrammarCard, PanelDone, PanelExpert } from '../types'
import { EFFORT, MAX_TOKENS, MODEL, SYSTEM, TIMEOUT_MS, eligible, frame, label, parseCheck, review, rows } from './grammar'
import type { Check, Seg } from './grammar'
import { DEEP_WORDS, DEEP_WORDS_ASKED, GOAL_LIMIT, PANEL_DONE_MAX, isPersonReader, lintDeep, lintGoal, lintLoop, lintPanel, userOnlyName, wordCount } from './lint'

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
const tracing = atom({ plugin: 'prompt-enhancer', key: 'tracing' } as const, null)
const grammar = atom({ plugin: 'prompt-enhancer', key: 'grammar' } as const, null)

type Kind = 'brief' | 'goal' | 'loop' | 'deep' | 'panel'

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
  deep: [
    { label: 'pro', icon: '🎓', required: true, missing: 'nothing a top professional would add' },
    { label: 'raw', icon: '🧱', required: true, missing: 'no raw material named' },
    { label: 'methods', icon: '🛠', required: true, missing: 'no methods or tools named' },
    { label: 'proof', icon: '🔍', required: true, missing: 'no outside check named' },
    { label: 'critic', icon: '🧐', required: true, missing: 'no critic subagent review' },
  ],
  // a panel's rows are its experts, read by parsePanel, not labelled parts
  panel: [],
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
  pro: 'Pro would',
  raw: 'Start from',
  methods: 'Methods',
  proof: 'Proof',
  critic: 'Critic',
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
const GOAL_RULES = `In (A): one end state that command output shows (an exit code, a count, an empty list), the check run after the last edit with its output quoted in the reply, and each constraint with the output that shows it ("git diff --stat lists only src/auth"). A before/after constraint ("count not below the start", "PID unchanged") saves its start value to a file first, and the final reply quotes that file beside the new value: the judge may not see early messages. A check script you write must be shown failing once on a deliberately broken input. Run every command (A) names once now, read-only, and use it only if it worked in this checkout: a branch with no upstream has no @{u} and never shows "ahead"; for "not pushed", use git log --branches --not --remotes (commits on no remote). When my request asks for quality or no gaps, file names or heading counts do not show it: add a check that does (a test, a read-back, or a fresh reviewer subagent's quoted verdict). No taste words ("production-ready", "looks good") and no clock deadline: the judge has no clock, only times printed in the chat. Copy the (B) sentence word for word, with your number in place of both Ks; leave <what is left> and N as they are.`

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

/**
 * 0.11.0 (the owner's ask, 2026-10-28): the rewrite is reviewed by a fresh critic subagent before it is shown, so
 * the author never grades its own rewrite. It sees only the request and the rewrite, never the four answers or the
 * author's reasons, and looks for the drift the 2026-10-24/25 evals found: new outputs, invented limits, unchecked
 * steps, self-run proofs, and checks that contradict the plan (salt left off a list that must hold every item).
 */
const DEEP_CRITIC =
  `Before you reply, give a fresh subagent only my request, word for word, and your rewritten prompt: never your four answers, your notes or your reasons. Have it list, each with a short quote from the rewrite, where the rewrite drifts from my request: a new deliverable or kind of output, a limit or fact I never gave, a step that assumes something you marked "(unchecked)", a proof only you or I would run, or a check that contradicts another step. Fix each finding that is real, and never mark one fixed that you did not change. Then write the critic's line: "critic: <how many findings>, <what you changed>", or "critic: none found".`
/**
 * "Deeper, not bigger": what a top professional would do, start from, use, and let prove the
 * result, then my prompt rewritten to ask for exactly that. The four questions are the owner's
 * (2026-10-19); the rest makes the answers concrete enough to act on and keeps the size.
 */
const DEEPEN = `I want a deeper version of my request above, not a bigger one. Do not start the work. Before rewriting it:
1. Ask me first (AskUserQuestion, at most 3 questions) when the field or the deliverable is unclear enough to change your answers, or when my request leaves out facts only I know that would change the result: who it is for, where, and the limits of time, money or taste. Ask them now: never move them into the rewrite as a step for later. Otherwise do not ask.
2. Answer four questions, specific to this request, one line each, under 200 characters:
   (1) what a top professional in this field would do here that I am not asking for;
   (2) the rawest material they would start from instead of what has already been digested for me, and where it is (a file, a URL, a command, a dataset). You may read files or run read-only commands to find it; if it is out of reach, say so;
   (3) the specific methods and tools they would use, by name;
   (4) what, other than you or me, would show the result is right: a test, a measurement, a known answer to compare with, or a person who is neither of us. Never "you review it" or a taste word ("looks good", "polished").
   Read a file before you say what it holds. Name only a path, command or commit you have checked exists; mark anything you could not check "(unchecked)".
3. Then rewrite my prompt to ask for exactly that. Same deliverable and about the same amount of work: add the raw material, the methods and the proof as steps, add no new deliverables, and keep my own words where they work. Every step serves my one deliverable (finds its material, makes it, or checks it); a second result is a new deliverable even as a last step: a further report, an audit of something else, a new script. Add no new kind of output either: a table, score sheet, breakdown or analysis my request does not name is a new deliverable. The proof checks the result; its numbers are not added to what I get unless I asked for them. Anything you marked "(unchecked)" goes into the rewrite as a check-first step with a fallback ("first confirm X exists; if it does not, do Y instead"), never as a plain step that assumes it. Under ${DEEP_WORDS} words, or ${DEEP_WORDS_ASKED} when you asked me questions first: the extra is only for my answers.
4. ${DEEP_CRITIC}
5. Reply with the four answers and the critic's line in a fenced code block tagged deep, one line each:
pro: …
raw: …
methods: …
proof: …
critic: …
then the rewritten prompt alone in a fenced code block tagged prompt.`

/**
 * The end check (2026-10-21 review): a fresh subagent, given only the request and the result, writes the content
 * mark so the author never grades its own work; the person mark says whether a person checked that need.
 */
const TRACE_RULE =
  'Before your final reply, give a fresh subagent only my request, word for word, and the finished result, and have it write one row per thing my request asks for: my words, where the result meets them (a short quote), and present, partly or absent. Add the person mark yourself: "person: yes" only when a person checked that need, "person: no" when a person should and did not, "person: n/a" when no person is involved. End with the rows in a fenced code block tagged trace: "<my words>" | <where the result meets it, quoted> | present / partly / absent | person: yes / no / n/a. Never mark present what the subagent did not find.'

/**
 * A panel of five: experts from different fields, two of them critics, picked for this request,
 * with what each would do and with which methods. The card shows them; the work starts on ▶ Go.
 * The core is the owner's prompt (2026-10-19), with his pause (same day) in place of "Then do
 * that work"; the rest keeps the methods real and the scope the same.
 * 2026-10-21 (his ask): a run swapped a people test for "a fresh subagent is the nearest step" and
 * never said what a subagent cannot measure, so a runbook meant for a new joiner was judged by agents
 * alone and lost its orientation part. Hence the cannot-measure clause and a done-when line per reader.
 * The same day a replay (3 runs) showed the person's test then became "fix a bug", never his words
 * "the domain knowledge and tech stack", and a review showed the example lines taught that. Hence each
 * person's line quotes the request, "the owner" and "Claude" name who runs it, and the work ends with
 * a trace back to the request.
 */
/**
 * 0.11.1 (the owner's ask, 2026-10-28): the first live run fixed five critic faults and no critic saw the fixed
 * text, so a fix that changes the text earns one critic run again on it, reported in a "(re-check)" row.
 * 0.11.0 (the owner's ask, 2026-10-28): the two critics run as fresh subagents, not as the author checking its own
 * work. Each gets only the request, its own field and methods, and the finished text, never the author's notes or
 * the other critic's findings. A critics block lets the card see whether they reported.
 */
const PANEL_CRITICS =
  "Run each of the two critics as its own fresh subagent, after the final text is written: give it only my request, word for word, its field and methods from the panel, and the finished text, never your notes, your reasoning or the other critic's findings. Have it run its methods on that text where it can and report each fault with a short quote. Fix each fault that is real, and never mark one fixed that you did not change. If a fix changed the text, run one critic again as a fresh subagent, with the same inputs and the changed text, and fix what it finds. End with the critics' results in a fenced code block tagged critics, one row per critic: <field> | <faults found> | <what you changed>, and for the critic run again a row whose field ends \"(re-check)\"."
const PANEL = `Before you start on my request above, pick the five experts from different fields who would make this outstanding, including two whose job is to find what's wrong with it. For each one, tell me what they would actually do and which methods they would use. Do not start the work in this turn; wait for my go-ahead or my corrections.
- If a choice must be settled before the work (which tools I will use, a fixed time, a budget), ask me with AskUserQuestion before you write the panel. The panel reply itself asks nothing: the card shows only the panel.
- Name each by field, not as an invented person: no personas, voices or quotes.
- Name every reader of the result: each person, agent, team or later maintainer my request implies, not only the one you can test here. For each, write one done-when line that quotes, in double quotes, the words of my request that say what that reader needs, then a test that checks those very words, and who runs it ("run by …"). A person's test is run by a person (me, or someone I name), and a stated limit never replaces that; when none can run it here, still list it and say who must. At most ${PANEL_DONE_MAX} done-when lines: when two readers need the same thing (me asking and me reading), merge them into one line that quotes both. Every line tests the one deliverable my request asks for; a reader whose test needs a second deliverable is out of scope.
- Pick methods that test what each reader needs, each named specifically ("think-aloud test", not "best practices"), and carry them out here where you can (read, run, test, measure, compare). Where one needs something you lack (a person, a lab, paid data), say so on its line, name the nearest step you can do, and say what that step cannot measure ("nearest step: a fresh subagent follows it; cannot measure: where a person gets lost").
- Reply with the five, then the done-when lines, in one fenced code block tagged panel, with at most one short line outside it. One line per expert, under 200 characters before the nearest-step clause: the field, "(critic)" after it for the two critics, a colon, what they would do, then "methods:" and the methods by name. Each done-when line starts "Done when, <reader> ("<my words about that reader>"):", or "Done when, <reader> (implied):" for a reader my request implies but never mentions, and names who runs its test. In those lines "the owner" is me and "Claude" is you. The format only:
Technical writer: turns each task into numbered steps a new hire can follow; methods: task analysis, plain-language review
Usability tester (critic): watches two people follow it cold and notes where they stall; methods: think-aloud test, task success rate; nearest step: a fresh subagent follows it; cannot measure: where a person gets lost
Done when, new hire ("<my words about new hires>"): they can say what the product is for and finish the first task from the guide alone; test: they follow it cold and explain it back, run by the owner
Done when, agent: a fresh agent finishes the same task from the guide alone; test: cold-start run, run by Claude; cannot measure: whether a person understands it
- When I say go, do the work. Don't role-play them, use their methods. Run each method with your tools where you can, and show its real result (its output, a count, a quote); if a method cannot run here, say so in one line rather than describe a result. Where a method ran as its nearest step, report the result as that step's and repeat what it cannot measure beside it; never present it as the original method's result. If a search finds nothing, widen it before you say a file does not exist. Give my request, word for word, to every subagent you use. ${PANEL_CRITICS} The critics judge the final text against my request, not the plan or a first draft. Before you finish, run each done-when test you can, report pass or fail with its result, and list each one you could not run and who must run it. ${TRACE_RULE} Keep the deliverable I asked for: the panel changes how the work is done, not what it is.`

/**
 * What ▶ Go sends. A prompt this mod submits skips its own hook, so the work rules travel in the
 * text itself. The live trial (2026-10-19) with no tools saw methods described but never run, and
 * a panel question that Go could not answer: hence the real-result and open-choice lines. A later
 * check saw one narrow search (`*.md`, in a folder of .tsx files) taken as "the source is not there":
 * hence the widen-the-search line. The nearest-step and done-when lines: see PANEL (2026-10-21).
 */
const PANEL_GO_RULES =
  "Go ahead with the panel above: do the work with their methods, not their voices. Run each method with your tools where you can, and show its real result (its output, a count, a quote); if one cannot run here, say so in one line rather than describe a result. Where a method ran as its nearest step, report the result as that step's and repeat what it cannot measure. If a search finds nothing, widen it before you say a file does not exist. Where the panel left a choice open, take the safest option and name it. " + PANEL_CRITICS + " Before you finish, run each done-when test you can, report pass or fail with its result, and list each one you could not run and who must run it."
/**
 * ▶ Go with your request word for word (2026-10-21, the reviewer's top fix): the work, its subagents
 * and its critics are all held to what you asked, not to the panel's paraphrase of it.
 */
function panelGo(request: string | undefined): string {
  if (request === undefined || request.trim() === '') return `${PANEL_GO_RULES} ${TRACE_RULE}`
  return `${PANEL_GO_RULES} Give my request below, word for word, to every subagent you use, and have the critics judge the result against it, not only against the plan. ${TRACE_RULE}\n\nMy request, word for word:\n<<<\n${request.trim()}\n>>>`
}
/** A typed reply on a panel card that means "start": it gets the same trace check as ▶ Go. A question does not. */
const GO_AHEAD = /^\s*(?:go(?: ahead)?|ok(?:ay)?|yes|yep|proceed|start|do it|let'?s go|continue|approved?|lgtm|sounds good)\b(?![^.!]*\?)/i
/** How many replies after Go the trace check waits for a trace before it gives up. */
const TRACE_TURNS = 12
const NO_TRACE = '⚠ No request trace yet: the work is not done until its trace is written (one row per thing you asked for)'

/** One quoted need from the panel's done-when lines, and whether its reader is a person. */
type Need = { quote: string; person: boolean }
const needsOf = (r: DraftedCommand): Need[] =>
  (r.done ?? []).flatMap(d => (d.quotes ?? []).map(quote => ({ quote, person: isPersonReader(d.reader) })))
const tokens = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? []
/** The same need: most words of the shorter quote appear in the other. */
function sameNeed(a: string, b: string): boolean {
  const [short, long] = tokens(a).length <= tokens(b).length ? [tokens(a), new Set(tokens(b))] : [tokens(b), new Set(tokens(a))]
  return short.length > 0 && short.filter(w => long.has(w)).length / short.length >= 0.75
}

/**
 * What the toast says when a turn after a panel's Go ends with a trace, or null when it has none. A row is
 * `"<his words>" | <where> | present / partly / absent | person: yes / no / n/a`. Counted against the
 * panel's quoted needs (2026-10-21 review): a need with no row, a status outside those words, and a person's
 * need not checked by a person (marked "no", or "n/a" on a person's quote) are all called out.
 */
function traceVerdict(answer: string, needs: readonly Need[]): string | null {
  const block = fences(answer, 'trace').find(f => f.body !== '')
  if (block === undefined) return null
  let present = 0
  let partly = 0
  let absent = 0
  let unchecked = 0
  let bad = 0
  let rows = 0
  const quotes: string[] = []
  for (const line of block.body.split(/\r?\n/)) {
    if (!line.includes('|')) continue
    const cells = line.split('|').map(c => c.trim().toLowerCase().replace(/[*_`]/g, ''))
    const content = cells.at(-2) ?? ''
    const person = cells.at(-1) ?? ''
    if (cells.every(c => /^[-: ]*$/.test(c)) || /^(?:content|status)$/.test(content)) continue // a header or a rule line
    rows++
    const quote = (line.split('|')[0] ?? '').trim()
    quotes.push(quote)
    const mark = person.match(/^person\s*:\s*(yes|no|n\/a)$/)
    const okContent = /^(?:present|partly|absent)$/.test(content)
    if (!okContent || !mark) bad++
    if (content === 'present') present++
    else if (content === 'partly') partly++
    else if (content === 'absent') absent++
    if (mark && (mark[1] === 'no' || (mark[1] === 'n/a' && needs.some(n => n.person && sameNeed(n.quote, quote))))) unchecked++
  }
  if (rows === 0) return '⚠ The request trace has no readable rows: ask Claude for one row per thing you asked for'
  const missing = needs.filter(n => !quotes.some(q => sameNeed(n.quote, q))).map(n => `"${n.quote}"`)
  if (bad === 0 && missing.length === 0 && unchecked === 0 && present === rows) {
    return `Request trace: ${present} of ${rows} present, every person check done`
  }
  const parts = [`${present} present, ${partly} partly, ${absent} absent`]
  if (unchecked > 0) parts.push(`${unchecked} need${unchecked > 1 ? 's' : ''} of a person not checked by a person`)
  if (bad > 0) parts.push(`${bad} row${bad > 1 ? 's' : ''} without a status the trace may use`)
  if (missing.length > 0) parts.push(`no row for ${missing.join(', ')}`)
  return `⚠ Request trace: ${parts.join('; ')}: read those rows before you accept the work`
}

/** The critics block after a panel's Go: null when both critic subagents reported (and one re-checked any change), else what the toast says. */
const NO_CRITICS = '⚠ No critics report: the two critics must run as fresh subagents and end with a critics block, one row each'
const NO_RECHECK = '⚠ A fix changed the text, but no critic checked the changed text: ask for one critic again on it'
/** A "what you changed" cell that says nothing changed. */
const NO_CHANGE = /^(?:none|nothing|no change[sd]?|n\/a|-|—|unchanged|0)\.?$/i
function criticsVerdict(answer: string): string | null {
  const block = fences(answer, 'critics').find(f => f.body !== '')
  if (block === undefined) return NO_CRITICS
  const rows = block.body
    .split(/\r?\n/)
    .filter(l => l.includes('|') && !l.split('|').every(c => /^[-: ]*$/.test(c.trim())) && !/^\s*\|?\s*field\s*\|/i.test(l))
    .map(l => l.split('|').map(c => c.trim()).filter((c, i, all) => !(c === '' && (i === 0 || i === all.length - 1))))
  const recheck = rows.filter(r => /\(\s*re-?check\s*\)/i.test(r[0] ?? ''))
  const first = rows.filter(r => !recheck.includes(r))
  if (first.length < 2) return `⚠ The critics block has ${first.length} row${first.length === 1 ? '' : 's'}, not 2: one critic did not report`
  const changed = first.some(r => r.length >= 3 && !NO_CHANGE.test(r.at(-1)!.replace(/[*_`]/g, '')))
  return changed && recheck.length === 0 ? NO_RECHECK : null
}

/** What ✎ Correct puts in the box on a panel card. A prompt that starts with it gets PANEL_REVISE attached. */
const PANEL_FIX = 'Correction to the panel: '
/** Attached to a panel correction, so the revised panel comes back in the shape the card reads. */
const PANEL_REVISE =
  'Revise the panel as I ask, then reply with all five again, and the done-when lines, in a fenced code block tagged panel, in the same line format, with at most one short line outside it. Do not start the work in this turn.'

const INSTRUCTION = { brief: CLARIFY, goal: GOAL, loop: LOOP, deep: DEEPEN, panel: PANEL } as const

/**
 * Grill mode (`++!`, `++g!`, `++l!`, `++d!`, `++p!`, 0.10.0, the owner's call 2026-10-25): an interview with
 * no cap on rounds or length, run until a ledger of the facts the result needs has no open line. The
 * 2026-10-24/25 evals showed the gaps that kept drafts under 8 were facts nobody asked for (the guide's form,
 * a pass rule), and that drafts grow when limits loosen, so the length caps give way to a trace rule.
 * 0.10.1, from the first grill eval: all 3 ++p! runs drafted the panel with 6-7 open ledger lines and asked
 * nothing (the panel's "the panel reply itself asks nothing" won over the interview), and all 3 ++d! runs read
 * daily and finance notes to guess the owner's household.
 */
const GRILL_INTERVIEW = `Grill mode: interview me until you hold every fact this result depends on, with no limit on rounds or length. First read the files about this request and run the read-only commands that could answer a question, and never ask what they answer. Do not search my private notes (daily notes, journal, personal areas) for facts about me, my family, health, money or relationships: ask me instead. Keep a ledger: start each reply that asks, and end the reply that drafts, with a fenced code block tagged ledger, one line per fact the result needs: "settled: <fact>: <value> (from me / from <file>)", "open: <fact>: <what its answer changes>" or "assumed: <fact>: <the value you will use>". Ask with AskUserQuestion, up to 4 questions per call (the tool's own limit), round after round: put the option you recommend first, marked (Recommended), and say in each question what its answer changes. Ask nothing whose answer would not change the result. When an answer opens a new gap, add it to the ledger as open and ask it. Draft only when no line is open, or when I say go or enough: then mark each open line assumed, with the value you will use.`
const GRILL_TRACE =
  'No length limit: write as much as the result needs, and no more. One deliverable, and every line of the draft traces to my request or to a settled or assumed ledger line; add nothing they do not hold.'
/** The plain instruction with its caps on questions, rounds and length taken out, and the interview put in. */
function grillInstruction(kind: Kind): string {
  const cut = (text: string, pairs: [string, string][]) => pairs.reduce((t, [a, b]) => t.split(a).join(b), text)
  const rounds: [string, string] = [
    ' At most 3 rounds: if a part is still open after that, pick the safest choice and name it in your reply.',
    '',
  ]
  const perRound: [string, string] = ['(at most 4 questions per round)', '(up to 4 questions per call)']
  switch (kind) {
    case 'brief':
      return cut(CLARIFY, [
        ['If something matters, ask me (AskUserQuestion, at most 4 questions, multiple choice where possible). Skip what I already said.', `Skip what I already said. ${GRILL_INTERVIEW}`],
        ['restate the task as a short brief, under 120 words, in a fenced code block', 'restate the task as a brief, in a fenced code block'],
      ]) + `\n${GRILL_TRACE}`
    case 'goal':
      return cut(GOAL, [rounds, perRound, [`Then write ONE condition, under ${MAX} characters.`, `Then write ONE condition, under ${GOAL_LIMIT.toLocaleString('en')} characters (the most /goal accepts).`]]) +
        `\n${GRILL_INTERVIEW}\n${GRILL_TRACE}`
    case 'loop':
      return cut(LOOP, [
        rounds,
        perRound,
        [`draft a goal instead, under ${MAX} characters,`, `draft a goal instead, under ${GOAL_LIMIT.toLocaleString('en')} characters,`],
        [`Then write ONE /loop line, under ${MAX} characters.`, 'Then write ONE /loop line.'],
      ]) + `\n${GRILL_INTERVIEW}\n${GRILL_TRACE}`
    case 'deep':
      return cut(DEEPEN, [
        [
          '1. Ask me first (AskUserQuestion, at most 3 questions) when the field or the deliverable is unclear enough to change your answers, or when my request leaves out facts only I know that would change the result: who it is for, where, and the limits of time, money or taste. Ask them now: never move them into the rewrite as a step for later. Otherwise do not ask.',
          `1. ${GRILL_INTERVIEW} Facts only I know matter most here: who it is for, where, and the limits of time, money or taste. Never move a question into the rewrite as a step for later.`,
        ],
        ['one line each, under 200 characters:', 'one line each:'],
        [` Under ${DEEP_WORDS} words, or ${DEEP_WORDS_ASKED} when you asked me questions first: the extra is only for my answers.`, ` ${GRILL_TRACE}`],
      ])
    case 'panel':
      return cut(PANEL, [
        [
          '- If a choice must be settled before the work (which tools I will use, a fixed time, a budget), ask me with AskUserQuestion before you write the panel.',
          `- ${GRILL_INTERVIEW} The ledger covers every choice the work needs: the deliverable's form and where it is saved, which tools I will use, time and budget.`,
        ],
        ['One line per expert, under 200 characters before the nearest-step clause:', 'One line per expert:'],
        [`At most ${PANEL_DONE_MAX} done-when lines: when two readers need the same thing`, 'When two readers need the same thing'],
        ['with at most one short line outside it.', 'with the ledger block and at most one short line outside it.'],
        [
          'The panel reply itself asks nothing: the card shows only the panel.',
          'Ask in the replies before the panel: the reply that holds the panel asks nothing, and it comes only when no ledger line is open.',
        ],
      ]) + `\n${GRILL_TRACE}`
  }
}

/** A grill reply's ledger, counted: the last fenced block tagged ledger, one fact per line. */
function readLedger(answer: string): { settled: number; open: number; assumed: number } | null {
  const f = fences(answer, 'ledger').at(-1)
  if (f === undefined) return null
  const lines = f.body.split('\n').map(l => l.replace(/^[\s>*-]+/, '').trim().toLowerCase())
  const count = (w: string) => lines.filter(l => l.startsWith(`${w}:`) || l.startsWith(`${w} `)).length
  return { settled: count('settled'), open: count('open'), assumed: count('assumed') }
}
/** The answer with its ledger blocks taken out, so a panel's note is only what it says outside both blocks. */
const withoutLedger = (answer: string) =>
  fences(answer, 'ledger').reduceRight((a, f) => `${a.slice(0, f.start)}${a.slice(f.end)}`, answer)

/**
 * Every fenced block tagged `tag`, in order: its body, and where the whole block sits in the answer.
 * A block closes on a fence line as long as the one that opened it, so a ````prompt block may hold a
 * ``` example. When no block closes that way (a fence on the body's own line), the loose form is read.
 */
function fences(answer: string, tag: string): { body: string; start: number; end: number }[] {
  const strict = [...answer.matchAll(new RegExp('(`{3,})' + tag + '[^\\n]*\\n([\\s\\S]*?)\\n[ \\t]*\\1(?!`)', 'g'))]
  const found = strict.length > 0 ? strict : [...answer.matchAll(new RegExp('```' + tag + '[^\\n]*\\n()([\\s\\S]*?)```', 'g'))]
  return found.map(m => ({ body: (m[2] ?? '').trim(), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }))
}

/** The body of the first fenced block tagged `tag`, or null. */
function block(answer: string, tag: string): string | null {
  const body = fences(answer, tag)[0]?.body ?? ''
  return body === '' ? null : body
}

/** A line with any list marker ("- ", "1. ", "2) ", "• ") and bold taken off, as models often write them. */
const unlist = (line: string) => line.replace(/\*\*/g, '').replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '')

/** "label: value" lines, in order; a line without a known label continues the previous value. */
function parseParts(body: string | null): { label: string; value: string }[] {
  if (body === null) return []
  const parts: { label: string; value: string }[] = []
  for (const line of body.split(/\r?\n/).map(unlist)) {
    const m = line.match(/^\s*([a-z ]+?)\s*:\s*(.*)$/i)
    const label = m?.[1]?.toLowerCase().trim()
    if (m && label !== undefined && label in NAMES) parts.push({ label, value: (m[2] ?? '').trim() })
    else if (parts.length > 0 && line.trim() !== '') parts[parts.length - 1]!.value += ` ${line.trim()}`
  }
  return parts
}

/** "Done when, …", "Done when (…", "Done when for …" or "Done when: …" (the last has no reader, which the card flags). */
const DONE_START = /^done[- ]when\s*(?:,|\(|\bfor\b|(?=:))\s*/i
/** A checkbox, a ✓, or * / _ emphasis a model puts around "Done when", taken off in that order. */
const undress = (line: string) =>
  line
    .replace(/^(?:\[[ xX]\]\s*|[✓✔☐☑]\s*)+/, '')
    .replace(/^[*_]+/, '')
    .replace(/^(done[- ]when)[*_]+/i, '$1')
/** A quote in straight or curly double quotes. */
const QUOTED = /"([^"]+)"|“([^”]+)”/g
/** "nearest step: …" and "cannot measure: …" clauses, taken out of an expert line into their own fields. */
const SWAP_CLAUSE = /(?:^|[;,(]\s*|\s)near(?:est|er) step\s*:\s*([^;)]*)/i
const LIMIT_CLAUSE = /(?:^|[;,(]\s*|\s)(?:cannot|can['’]t|can not) measure\s*:\s*([^;)]*)/i

/** The index of the first colon outside double quotes, or -1. */
function colonOutsideQuotes(text: string): number {
  let open: string | null = null
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (open === null && (c === '"' || c === '“')) open = c === '"' ? '"' : '”'
    else if (open !== null && c === open) open = null
    else if (open === null && c === ':') return i
  }
  return -1
}

/** A done-when line read into its reader, its quotes of the request and its test, or null when the line is not one. */
function doneLine(line: string): PanelDone | null {
  // "Done-when auditor (critic): …" stays an expert: DONE_START wants a comma, "(", "for" or ":" after "when"
  const plain = undress(line).trim()
  const start = plain.match(DONE_START)
  if (!start) return null
  const rest = plain.slice(start[0].length)
  const colon = colonOutsideQuotes(rest)
  const head = colon < 0 ? rest : rest.slice(0, colon)
  const test = colon < 0 ? '' : rest.slice(colon + 1).trim()
  const quotes = [...`${head} ${test}`.matchAll(QUOTED)].map(m => (m[1] ?? m[2] ?? '').trim()).filter(q => q !== '')
  const implied = /\bimplied\b/i.test(head.replace(QUOTED, ''))
  const reader = head
    .replace(QUOTED, '')
    .replace(/\bimplied\b/gi, '')
    .replace(/[()]/g, ' ')
    .replace(/[\s,;:*_—–-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return { reader, test, quotes, ...(implied ? { implied } : {}) }
}

/**
 * A panel's lines, one expert each: "Field (critic): what they would do; methods: …". A list
 * marker or bold is dropped; a line with no colon is all field, with nothing they would do. The
 * methods are split off at the last "methods:" so the card can always show them, after the
 * "nearest step:" and "cannot measure:" clauses are taken into their own fields (so a clause never
 * hides generic methods, and the card shows it whole). A line that starts "Done when" is a reader's
 * test, not an expert; a line with no colon right after one is the rest of that test.
 */
function parsePanel(body: string): { experts: PanelExpert[]; done: PanelDone[] } {
  const experts: PanelExpert[] = []
  const done: PanelDone[] = []
  let last: 'expert' | 'done' | null = null
  for (const raw of body.split(/\r?\n/)) {
    const line = unlist(raw).trim()
    if (line === '') continue
    const d = doneLine(line)
    if (d) {
      done.push(d)
      last = 'done'
      continue
    }
    const colon = line.indexOf(':')
    // the rest of a wrapped done-when line: no colon, or it starts with its own "test:" or runner
    if (last === 'done' && (colon < 0 || /^(?:test|run by|cannot measure|can['’]t measure)\b/i.test(line))) {
      const prior = done[done.length - 1]!
      prior.test = `${prior.test} ${line}`.trim()
      continue
    }
    last = 'expert'
    const head = colon < 0 ? line : line.slice(0, colon)
    let rest = colon < 0 ? '' : line.slice(colon + 1).trim()
    const swap = rest.match(SWAP_CLAUSE)?.[1]?.trim()
    const limit = rest.match(LIMIT_CLAUSE)?.[1]?.trim()
    rest = rest.replace(SWAP_CLAUSE, '').replace(LIMIT_CLAUSE, '').replace(/\(\s*\)/g, '').trim()
    const split = rest.match(/^([\s\S]*)\bmethods?\s*:\s*([\s\S]*)$/i)
    experts.push({
      field: head.replace(/\s*\(\s*critic\s*\)\s*/i, ' ').trim(),
      critic: /\(\s*critic\s*\)/i.test(head),
      work: (split ? (split[1] ?? '') : rest).replace(/[\s;,.—–-]+$/, '').trim(),
      methods: split ? (split[2] ?? '').replace(/[\s;,]+$/, '').trim() : '',
      ...(swap !== undefined ? { swap } : {}),
      ...(limit !== undefined ? { limit } : {}),
    })
  }
  return { experts, done }
}

/** A draft in the answer: a deeper prompt or a panel when that is what was asked for, else a goal or loop command, or a brief. */
function findDraft(answer: string, asked: Kind): DraftedCommand | null {
  if (asked === 'panel') {
    // only a ++panel request is read this way: its goal or brief blocks, if any, stay text
    const f = fences(answer, 'panel')[0]
    if (f === undefined || f.body === '') return null
    // what it says outside the block: the re-check saw a plan-changing assumption there in 194 characters
    const note = withoutLedger(`${answer.slice(0, f.start)} ${answer.slice(f.end)}`).replace(/\s+/g, ' ').trim()
    return { kind: 'panel', args: f.body, parts: [], ...parsePanel(f.body), note }
  }
  if (asked === 'deep') {
    // only a ++deep request is read this way, and its card wins over any other block in the reply
    const lens = fences(answer, 'deep').find(f => f.body !== '')
    // the rewrite is the prompt block after the four answers; a quoted "your prompt" before them is not it
    const prompts = fences(answer, 'prompt').filter(f => f.body !== '')
    const rewrite = prompts.find(f => f.start >= (lens?.end ?? 0)) ?? prompts.at(-1)
    return lens === undefined && rewrite === undefined
      ? null
      : { kind: 'deep', args: rewrite?.body ?? '', parts: parseParts(lens?.body ?? null) }
  }
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
    await $.command.register({
      name: 'deepen',
      description: 'Say how a top professional would do a request, then rewrite it deeper, not bigger (same as ++deep or ++d)',
      argumentHint: '<request>',
    })
    await $.command.register({
      name: 'panel',
      description: 'Pick five experts from different fields, two of them critics; the work starts with their methods when you press Go (same as ++panel or ++p)',
      argumentHint: '<request>',
    })
    return next(e)
  })

  // "++goal …", "++loop …", "++deep …", "++panel …" or "++ …": attach the instruction, send the request as you wrote it.
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
      const waiting = await read($, ready)
      const settles = waiting?.kind
      // A panel correction, from ✎ Correct or typed by hand while the panel card waits: the revised
      // five come back in the shape the card reads, as a new card, still held to your request.
      const draftingNow = await read($, drafting)
      if (text.startsWith(PANEL_FIX.trim()) && (settles === 'panel' || draftingNow?.kind === 'panel')) {
        const request = waiting?.request ?? draftingNow?.request
        await update($, ready, () => null)
        await update($, drafting, () => ({ kind: 'panel', turnsLeft: DRAFT_TURNS, ...(request !== undefined ? { request } : {}) }))
        return next({ ...e, context: [...(e.context ?? []), PANEL_REVISE] })
      }
      // A go-ahead typed on a panel card starts the work just as ▶ Go does, so its reply is checked for the trace too.
      if (e.origin.kind === 'composer' && settles === 'panel' && waiting !== null && GO_AHEAD.test(text)) {
        await update($, tracing, () => ({ request: waiting.request ?? '', needs: needsOf(waiting), turns: 0 }))
      }
      // Your next prompt after a brief, a panel or a deeper prompt (a go-ahead, a correction, the rewrite itself) settles its card.
      if (e.origin.kind === 'composer' && (settles === 'brief' || settles === 'panel' || settles === 'deep')) await update($, ready, () => null)
      return next(e)
    }
    // "++goal" / "++loop", or the short "++g" / "++l": the letter right after "++" and then a space,
    // so "++ go ahead" and "++loose ideas" stay ordinary briefs. "++deep" / "++d" and "++panel" / "++p"
    // must touch the "++" too, so "++ deep dive", "++deeper", "++do", "++ panel notes" and "++please" stay briefs.
    // A word or letter counts only when a space, a colon or the end follows it: "++deep-dive", "++goal-setting",
    // "++panel's" and "++deep, then" are briefs (a hyphen or comma once started the mode with "-dive" as the request).
    // A "!" right after the mode is grill mode (0.10.0): "++!", "++g!", "++goal!", "++d!", "++panel!".
    const m = text.match(/^\+\+(?:\s*(goal|loop)(!?)(?=[\s:]|$)[:\s]*|(deep|panel)(!?)(?=[\s:]|$)[:\s]*|([gldp])(!?)(?::\s*|\s+|$)|(!)(?=\s|$)\s*)/i)
    const word = (m?.[1] ?? m?.[3] ?? m?.[5])?.toLowerCase()
    const grill = Boolean(m?.[2] || m?.[4] || m?.[6] || m?.[7])
    const kind: Kind =
      word === undefined
        ? 'brief'
        : word.startsWith('d')
          ? 'deep'
          : word.startsWith('p')
            ? 'panel'
            : word.startsWith('g')
              ? 'goal'
              : 'loop'
    const request = text.slice(m ? m[0].length : 2).trim()
    if (request === '') return next(e)
    // a panel keeps your words: its card holds the done-when lines to them, and ▶ Go hands them to the work;
    // a deep rewrite keeps them so the card can tell an output you never named
    await update($, drafting, () => ({ kind, turnsLeft: DRAFT_TURNS, words: wordCount(request), ...(grill ? { grill } : {}), ...(kind === 'panel' || kind === 'deep' ? { request } : {}) }))
    // a new request ends the trace check of the work before it
    await update($, tracing, () => null)
    await update($, ready, () => null)
    let instruction: string = grill ? grillInstruction(kind) : INSTRUCTION[kind]
    if (kind !== 'brief') {
      const names = await userOnlySkills($).catch(() => [])
      const list = names.map(n => `/${n}`).join(', ')
      if (names.length > 0 && kind === 'deep') {
        instruction += `\nUser-only skills here (Claude cannot call them): ${list}. If a method needs one, the rewrite says I type it myself; do not rebuild its steps.`
      } else if (names.length > 0 && kind === 'panel') {
        instruction += `\nUser-only skills here (Claude cannot call them): ${list}. If a method needs one, say in one line that I must type it myself; do not rebuild its steps.`
      } else if (names.length > 0) {
        instruction += `\nUser-only skills here (Claude cannot call them, and a loop pass gets them as plain text): ${list}. If a step needs one, do not rebuild its steps: say in one line that I must type it myself, and leave that step out.`
      }
    }
    return next({ ...e, text: request, context: [...(e.context ?? []), instruction] })
  }).catch(($, e, next) => next(e)) // never block your prompt

  for (const [name, prefix, also] of [
    ['clarify', '++', ''],
    ['goalify', '++goal', ' (or ++g)'],
    ['loopify', '++loop', ' (or ++l)'],
    ['deepen', '++deep', ' (or ++d)'],
    ['panel', '++panel', ' (or ++p)'],
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
    // After a panel's Go: has the work ended with a trace back to your request? The check stays on until a
    // trace arrives, since work that asks "shall I go on?" ends its real result turns later (2026-10-21 review).
    const t = e.agentId === undefined ? await read($, tracing) : null
    if (t !== null) {
      const verdict = traceVerdict(e.answer, t.needs)
      if (verdict !== null) {
        await update($, tracing, () => null)
        // the critics' warning first, so the trace verdict stays the last word
        const critics = criticsVerdict(e.answer)
        if (critics !== null) $.ui.toast(critics)
        $.ui.toast(verdict)
      } else if (t.turns + 1 >= TRACE_TURNS) {
        await update($, tracing, () => null)
        $.ui.toast(`${NO_TRACE}; the check stops after ${TRACE_TURNS} replies`)
      } else {
        await update($, tracing, v => (v === null ? null : { ...v, turns: v.turns + 1 }))
        $.ui.toast(NO_TRACE)
      }
    }
    const d = await read($, drafting)
    if (d === null || e.agentId !== undefined) return result
    // A loop request may come back as a goal when that fits better: take either.
    const found = findDraft(e.answer, d.kind)
    if (found !== null) {
      await update($, drafting, () => null)
      // the card checks a goal, loop, rewrite or panel against the user-only skills: know them before it draws
      if (found.kind !== 'brief' && userOnly === null) await userOnlySkills($).catch(() => [])
      // grill mode: the card shows the final ledger, so a fact left open is flagged rather than guessed silently
      if (d.grill === true) {
        found.grill = true
        const ledger = readLedger(e.answer)
        if (ledger !== null) found.ledger = ledger
      }
      await update($, ready, () =>
        found.kind === 'deep'
          ? { ...found, words: d.words, asked: d.turnsLeft < DRAFT_TURNS, ...(d.request !== undefined ? { request: d.request } : {}) }
          : found.kind === 'panel' && d.request !== undefined
            ? { ...found, request: d.request }
            : found,
      )
      // a brief or a panel waits on the card for your go-ahead: nothing goes in the box
      if (found.kind !== 'brief' && found.kind !== 'panel' && found.args !== '') {
        // Only into an empty box: what you typed while Claude drafted stays.
        const what = found.kind === 'deep' ? 'Deeper prompt' : `/${found.kind}`
        const box = await boxState($)
        const filled =
          box === 'free'
            ? await $.prompt
                .fill({ text: found.kind === 'deep' ? found.args : `/${found.kind} ${found.args}`, mode: 'replace' })
                .catch(() => undefined)
            : undefined
        $.ui.toast(
          filled?.isFilled
            ? `${what} ready in the prompt box: check it, then Enter`
            : box === 'yours'
              ? `${what} ready above the prompt; your typing was left in the box`
              : `${what} ready above the prompt`,
        )
      }
    } else if (d.grill === true) {
      // an interview has no turn limit: it waits for the draft, your next ++ request, or nothing at all
      const ledger = readLedger(e.answer)
      if (ledger !== null) $.ui.toast(`Grill: ${ledger.settled + ledger.assumed} settled, ${ledger.open} open`)
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
    const accent = kind === 'brief' || kind === 'panel' ? 'blue' : kind === 'deep' ? 'magenta' : 'cyan'
    const title =
      kind === 'brief'
        ? ' 📋 BRIEF '
        : kind === 'goal'
          ? ' ◎ GOAL READY '
          : kind === 'loop'
            ? ' ↻ LOOP READY '
            : kind === 'panel'
              ? ' 👥 PANEL '
              : ' ◆ DEEPER '
    const width = Math.max(30, e.props.bodyColumns - 6)
    // "🧱 Start from" is one wider than the other names
    const labelWidth = kind === 'deep' ? 13 : 12
    // a deep answer may take three lines (its instruction asks for under 200 characters); the other parts one.
    // At two lines the live trial saw 27 of 28 answers cut, one of them hiding an added deliverable.
    // At least 240 characters, so a 200-character answer fits at 80 columns too.
    const room = kind === 'deep' ? Math.max((width - labelWidth) * 3, 240) : width - labelWidth

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
            {`${name.padEnd(labelWidth)} `}
          </Text>
          <Text>{value.length > room ? `${value.slice(0, room - 1)}…` : value}</Text>
        </Text>,
      )
    }
    // What the judge or the loop could not use, read from the command text itself.
    if (kind === 'goal') gaps.push(...lintGoal(r.args, userOnly ?? []))
    if (kind === 'loop') gaps.push(...lintLoop(r.args, userOnly ?? []))
    if (kind === 'deep') gaps.push(...lintDeep(byLabel.get('proof'), r.args, userOnly ?? [], r.request, r.asked === true, r.grill === true))
    // a card from before 0.9.1 has no done lines and one from before 0.9.2 no request: neither is judged on them
    if (kind === 'panel') gaps.push(...lintPanel(r.experts ?? [], userOnly ?? [], (r.note ?? '').length, r.done, r.request, r.grill === true))
    if (r.grill === true) {
      const l = r.ledger
      if (l === undefined) gaps.push('no ledger: grill mode drafts from one, so nothing shows what was settled')
      else {
        if (l.open > 0) gaps.push(`${l.open} ledger ${l.open === 1 ? 'fact is' : 'facts are'} still open: the draft guessed ${l.open === 1 ? 'it' : 'them'}`)
        rows.push(
          <Text key="pe-ledger" wrap="wrap">
            <Text bold color={accent}>
              {`${'🧾 Ledger'.padEnd(labelWidth)} `}
            </Text>
            <Text>{`${l.settled} settled${l.assumed > 0 ? ` · ${l.assumed} assumed` : ''}${l.open > 0 ? ` · ${l.open} open` : ''}`}</Text>
          </Text>,
        )
      }
    }
    const tooLong = kind === 'goal' && r.args.length > GOAL_LIMIT
    // what this card puts in the box: the command, or for deep the rewritten prompt itself
    const cmd = kind === 'deep' ? r.args : `/${kind} ${r.args}`
    if (kind === 'deep' && r.args !== '') {
      // the rewrite in full, under its own label: it is what you send, and a cut can hide an added step
      const flat = r.args.replace(/\s+/g, ' ')
      rows.push(
        <Box key="pe-rewrite" flexDirection="column">
          <Text bold color={accent}>
            ✍ Rewrite
          </Text>
          <Text wrap="wrap">{flat.length > 1500 ? `${flat.slice(0, 1499)}…` : flat}</Text>
        </Box>,
      )
    }
    // a panel: one row per expert, the critics in red. The methods are what you judge before Go, so
    // they always show in full beside the field; what the expert would do follows, dim, cut at two lines.
    for (const [i, x] of (r.experts ?? []).entries()) {
      const head = `${x.critic ? '🔎' : '🛠'} ${x.field}${x.critic ? ' · critic' : ''}`
      const methods = x.methods.length > 300 ? `${x.methods.slice(0, 299)}…` : x.methods
      rows.push(
        <Box key={`pe-expert-${i}`} flexDirection="column">
          <Text wrap="wrap">
            <Text bold color={x.critic ? 'red' : accent}>
              {head}
            </Text>
            {methods !== '' && <Text>{`  methods: ${methods}`}</Text>}
          </Text>
          {x.work !== '' && (
            <Text dimColor wrap="wrap">
              {`   ${x.work.length > width * 2 ? `${x.work.slice(0, width * 2 - 1)}…` : x.work}`}
            </Text>
          )}
          {/* the swap and its limit, whole: a cut here once hid the very words you judge it by */}
          {(x.swap !== undefined || x.limit !== undefined) && (
            <Text key={`pe-swap-${i}`} wrap="wrap">
              {`   ↳ nearest step: ${x.swap ?? '(none named)'} · cannot measure: ${x.limit ?? '(not said)'}`}
            </Text>
          )}
        </Box>,
      )
    }
    // one row per reader of the result and the test that settles it for them: you judge these before Go too
    // The test is shown whole (up to 600 characters): who runs it sits at the end, where a cut would hide it.
    for (const [i, d] of (r.done ?? []).entries()) {
      const test = d.test.length > 600 ? `${d.test.slice(0, 599)}…` : d.test
      const quotes = (d.quotes ?? []).map(q => `  “${q}”`).join('') + (d.implied === true ? '  (implied)' : '')
      rows.push(
        <Text key={`pe-done-${i}`} wrap="wrap">
          <Text bold color={accent}>
            {`✓ Done when · ${d.reader === '' ? '(no reader)' : d.reader}`}
          </Text>
          {quotes !== '' && <Text italic>{quotes}</Text>}
          <Text>{`  ${test}`}</Text>
        </Text>,
      )
    }
    // what the panel reply said outside its block, up to three lines: an assumption there changes the plan
    if (kind === 'panel' && (r.note ?? '') !== '') {
      const note = r.note ?? ''
      rows.push(
        <Text key="pe-note" wrap="wrap">
          <Text bold color={accent}>
            {'💬 Also said  '}
          </Text>
          <Text>{note.length > width * 3 ? `${note.slice(0, width * 3 - 1)}…` : note}</Text>
        </Text>,
      )
    }
    // No labelled parts at all (an older reply): show the text itself, at most a few lines of it.
    if (rows.length === 0 && kind !== 'deep') {
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
              // your own words in the box stay, and a box that cannot be read may hold them
              const box = await boxState($)
              if (box === 'yours') return void $.ui.toast('Your prompt box has text: clear it, then press ✎ Correct again')
              if (box === 'unknown') return void $.ui.toast('Could not read the prompt box: type "Correction to the brief:" and your correction yourself')
              await close()
              await $.prompt.fill({ text: 'Correction to the brief: ', mode: 'replace' }).catch(() => undefined)
            }}
          />
          <Text>  </Text>
          <Button key="pe-dismiss" label="Dismiss" role="dismiss" onPress={close} />
        </Box>
      ) : kind === 'panel' ? (
        <Box key="pe-actions" marginTop={1}>
          <Button
            key="pe-go"
            label="▶ Go"
            variant="primary"
            onPress={async () => {
              await close()
              // the reply to this Go is checked for a trace back to your request when its turn ends
              await update($, tracing, () => ({ request: r.request ?? '', needs: needsOf(r), turns: 0 }))
              await $.prompt.submit({ text: panelGo(r.request), asUser: true })
            }}
          />
          <Text>  </Text>
          <Button
            key="pe-correct"
            label="✎ Correct"
            onPress={async () => {
              // your own words in the box stay, and a box that cannot be read may hold them
              const box = await boxState($)
              if (box === 'yours') return void $.ui.toast('Your prompt box has text: clear it, then press ✎ Correct again')
              if (box === 'unknown') return void $.ui.toast(`Could not read the prompt box: type "${PANEL_FIX.trim()}" and your correction yourself`)
              await close()
              // the revised panel comes back as a card
              await update($, drafting, () => ({ kind: 'panel', turnsLeft: DRAFT_TURNS, ...(r.request !== undefined ? { request: r.request } : {}) }))
              await $.prompt.fill({ text: PANEL_FIX, mode: 'replace' }).catch(() => undefined)
            }}
          />
          <Text>  </Text>
          <Button key="pe-dismiss" label="Dismiss" role="dismiss" onPress={close} />
        </Box>
      ) : kind === 'deep' ? (
        <Box key="pe-actions" marginTop={1}>
          {r.args !== '' && (
            <Button
              key="pe-send"
              label="▶ Send"
              variant="primary"
              onPress={async () => {
                const box = await boxState($, cmd)
                // other words in the box may be your edit of the rewrite: never send the old one over them
                if (box === 'yours') return void $.ui.toast('Your prompt box has text: send it with Enter, or clear it and press ▶ Send')
                await close()
                // clear the box only when it holds this rewrite
                if (box === 'free') await $.prompt.fill({ text: '', mode: 'replace' }).catch(() => undefined)
                await $.prompt.submit({ text: r.args, asUser: true })
              }}
            />
          )}
          {r.args !== '' && <Text>  </Text>}
          {r.args !== '' && (
            <Button
              key="pe-edit"
              label="✎ Edit in box"
              onPress={async () => {
                const box = await boxState($, cmd)
                if (box === 'free') await $.prompt.fill({ text: cmd, mode: 'replace' }).catch(() => undefined)
                else if (box === 'yours') $.ui.toast('Your prompt box has text: clear it, then press ✎ Edit again')
                else $.ui.toast('Could not read the prompt box: copy the rewrite from the card')
              }}
            />
          )}
          {r.args !== '' && <Text>  </Text>}
          {r.args !== '' && (
            <Button
              key="pe-asgoal"
              label="◎ As goal"
              onPress={async () => {
                // the proof becomes the goal's check: ++g drafts a /goal from the rewrite, after your Enter
                const box = await boxState($, cmd)
                if (box === 'yours') return void $.ui.toast('Your prompt box has text: clear it, then press ◎ As goal again')
                if (box === 'unknown') return void $.ui.toast('Could not read the prompt box: type ++g and the rewrite yourself')
                await close()
                await $.prompt.fill({ text: `++g ${r.args}`, mode: 'replace' }).catch(() => undefined)
                $.ui.toast('++g and the rewrite are in the prompt box: press Enter to draft a /goal')
              }}
            />
          )}
          {r.args !== '' && <Text>  </Text>}
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
          : kind === 'deep'
            ? 'deeper, not bigger · nothing starts until you send it'
            : kind === 'panel'
              ? 'Go starts the work with their methods · the critics check the finished result'
              : null

    const mine = (
      <Box key="pe-ready" flexDirection="column" borderStyle="round" borderColor={gaps.length > 0 ? 'yellow' : accent} paddingX={1}>
        <Box>
          <Text bold color="black" backgroundColor={accent}>
            {title}
          </Text>
          <Text dimColor>
            {kind === 'brief' || kind === 'panel'
              ? '  nothing starts until you say go'
              : kind === 'deep'
                ? `  ${r.words === undefined ? '' : `your ${r.words} words → `}${wordCount(r.args)} words`
                : `  /${kind} · ${r.args.length} chars`}
          </Text>
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

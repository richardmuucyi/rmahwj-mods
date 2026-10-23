// Checks on a drafted /goal or /loop that need no model call. Each rule is a
// fact about how the commands work (Claude Code 2.1.302, read from the build):
// the /goal judge is a small model that runs nothing and reads only the
// conversation; nothing counts turns for Claude or the judge; a reached cap is
// judged met; a loop pass gets a user-only skill as plain text. A ++deep draft
// gets two more: its proof must be something outside the two of us, and its
// rewrite must stay about the size of the request. A ++panel draft is held to
// its own prompt: five experts, different fields, two critics, methods named.

import type { PanelDone, PanelExpert } from '../types'

/** /goal refuses a longer condition. */
export const GOAL_LIMIT = 4000

/** The printed count the cap needs: "Goal turn N/15". Group 1 is the cap it counts to. */
const COUNTER = /goal turn\s+N\s*\/\s*(\d+)/i
/** The tested cap clause: after 15 "Stop hook feedback" messages. Group 1 is K. */
const CAP_AFTER = /after\s+(\d+)\s+"?stop hook feedback"?\s+messages/i
/** The cap's own words, so a reached cap does not read as success. */
const CAPPED = /\bGOAL CAPPED\b/
/**
 * The cap as a real either/or: "either … (A) … or (B)". Tested 2026-10-18: written as a plain
 * "… or done when", the judge accepted the cap in 1 of 3 runs; as an either/or, in 7 of 7.
 */
const EITHER = /\beither\b[^.]{0,40}\(A\)[\s\S]*\bor\s*\(B\)/i
/** A turn or try cap in words: "stop after 15 turns", "or 40 turns", "max 15 turns", "a 15-turn limit". */
const BOUND =
  /\b(?:after|max(?:imum)?(?:\s+of)?|at most|up to|or)\s+\d+\s*(?:turns?|tries|attempts|rounds|iterations|replies|goal checks?|checks)\b|\b\d+[- ]turn\b/i
/** A placeholder the draft should have filled: the cap letter K, or the end-state slot. */
const PLACEHOLDER = /goal turn\s+N\s*\/\s*K\b|after\s+K\s+"?stop hook|<end state/i
/** A clock deadline: "By 09:00", "until 5pm", "by noon", "within 2 hours", "in 30 minutes", "overnight". */
const CLOCK =
  /\b(?:by|before|until|at)\s+(?:\d{1,2}(?::\d{2}\s*(?:am|pm)?|\s*(?:am|pm))|noon|midnight|end of (?:the )?day|eod)\b|\b(?:within|at most|after|in)\s+\d+\s*(?:min(?:ute)?s?|h(?:ou)?rs?|hours?|h|days?)\b|\b(?:overnight|tonight|tomorrow)\b(?![.\w])/i
/** Words a judge reading a transcript cannot settle. A bare "clean" is fine: "lint is clean" is a check. */
const TASTE =
  /\b(?:production[- ]ready|looks? (?:good|great|right|nice)|polished|robust|clean code|high[- ]quality|well[- ]designed|elegant|beautiful)\b/i
/** A loop that says what to report when a pass finds nothing. */
const QUIET =
  /\b(?:if|when)\s+(?:nothing|no\s+(?:change|changes|news|new)\b|unchanged|quiet|all is quiet|everything is (?:green|quiet))|\bnothing\s+(?:new\s+)?to report\b|\bsay so in one (?:line|sentence)\b|沒有變化|没有变化|無變化|无变化/i

/** What a /goal condition's judge could not use, one short line each. `userOnly` are skill names Claude cannot call. */
export function lintGoal(args: string, userOnly: readonly string[] = []): string[] {
  const out: string[] = []
  if (args.length > GOAL_LIMIT) out.push(`over ${GOAL_LIMIT.toLocaleString('en')} characters: /goal will refuse it`)
  if (PLACEHOLDER.test(args)) out.push('placeholder left in (K or <end state>): put the real value in')
  const counter = args.match(COUNTER)
  const capAfter = args.match(CAP_AFTER)
  const capped = CAPPED.test(args)
  if (!counter && (BOUND.test(args) || capAfter)) out.push('turn cap with no printed count: nothing counts turns, so it never trips')
  if (counter && !capped) out.push('count with no GOAL CAPPED line: a reached cap would read as achieved')
  if (counter && capped && !EITHER.test(args)) out.push('cap not written as "either: (A) … or (B)": the judge may still demand the end state')
  if (counter && capAfter && counter[1] !== capAfter[1]) {
    out.push(`the count goes to ${counter[1]} but the cap is after ${capAfter[1]} messages: make them the same`)
  }
  if (!counter && !capped && !capAfter && !BOUND.test(args) && !PLACEHOLDER.test(args)) {
    out.push('no cap: it runs until met, or until a guard or you stop it')
  }
  if (CLOCK.test(args)) out.push('clock deadline: the judge has no clock, only times printed in the chat')
  const taste = args.match(TASTE)
  if (taste) out.push(`"${taste[0]}" cannot be judged from the chat`)
  out.push(...userOnlyHits(args, userOnly, 'Claude cannot call it'))
  return out
}

/** What a /loop line lacks, one short line each. `userOnly` are skill names a loop pass cannot run. */
export function lintLoop(args: string, userOnly: readonly string[] = []): string[] {
  const out: string[] = []
  if (!QUIET.test(args)) out.push('no one-line report for a quiet pass')
  out.push(...userOnlyHits(args, userOnly, 'a loop pass gets it as plain text'))
  return out
}

/** A deeper prompt is the same task done better, not more of it: the ++deep instruction caps the rewrite here. */
export const DEEP_WORDS = 150

/** How many words a text has. */
export const wordCount = (text: string) => text.split(/\s+/).filter(w => w !== '').length

/**
 * A proof whose subject is one of us: "you review it", "I look it over", "you or I read it",
 * "your own review", "the owner likes it". Only the start counts, so "an editor I trust reviews
 * it" and "a person who is neither of us signs off" are other people, as they should be.
 */
const SELF =
  /^\s*(?:(?:you|i|we|claude|the (?:owner|user))(?:\s+(?:or|and)\s+(?:you|i|me|we|claude))?\s+(?:\w+\s+){0,2}?(?:reviews?|checks?|judges?|approves?|eyeballs?|looks?|confirms?|signs?|agrees?|reads?|decides?|likes?|picks?|feels?|thinks?)\b|(?:your|my|our)\s+(?:own\s+)?(?:review|check|read(?:ing)?|look|judge?ment|opinion|approval|sign-off|eye|taste|call|sense)\b)/i
/**
 * Signs that a proof names something outside the two of us: a command, a test, a measurement, a
 * reference to compare against. A bare number is not one: "you read all 12 pages" is still you reading.
 */
const OUTSIDE =
  /`|\b(?:tests?|pass(?:es)?|exits?|measure(?:d|ment|s)?|benchmark|metrics?|scores?|counts?|compare[sd]?|against|match(?:es|ed)?|known|reference|spec|users?|customers?|experts?|independent|instrument|validator|checker|linter|ci|diff|recount)\b/i

/** What a ++deep draft lacks, one short line each. `proof` is its proof part; `userOnly` are skill names Claude cannot call. */
export function lintDeep(proof: string | undefined, rewrite: string, userOnly: readonly string[] = []): string[] {
  const out: string[] = []
  if (rewrite.trim() === '') out.push('no rewritten prompt: nothing to send')
  const n = wordCount(rewrite)
  if (n > DEEP_WORDS) out.push(`the rewrite is ${n} words: bigger, not deeper?`)
  if (proof !== undefined) {
    const outside = OUTSIDE.test(proof)
    // a taste word beside a measurement ("a load test shows it robust") is a description, not the check
    const taste = outside ? null : proof.match(TASTE)
    if (SELF.test(proof) && !outside) out.push('the proof is only you or me looking: name an outside check')
    else if (taste) out.push(`the proof "${taste[0]}" is a taste word, not an outside check`)
  }
  // "First I'll type /x" is what the instruction asks for: only a step Claude would run is flagged
  out.push(...userOnlyHits(rewrite, userOnly, 'Claude cannot call it, so you type it', true))
  return out
}

/** Characters outside the panel block past which the reply may hold a question or work started early. */
const PANEL_OUTSIDE = 300
/** Methods that name no method: a line made only of these was not thought through. */
const GENERIC =
  /^(?:(?:industry )?best practices?|industry standards?|standards?|research|analysis|review|brainstorm(?:ing)?|experience|expertise|common sense|testing|intuition|feedback|iteration|domain knowledge)$/i
/** The words a field name often ends with that do not change the field: "Web performance engineer" and "… specialist" are one field. */
const ROLE = /\s+(?:engineer|specialist|expert|consultant|analyst|professional|practitioner|lead|manager|reviewer|auditor|officer)$/

/** A field reduced to what makes it a field, for spotting two experts from the same one. */
const fieldKey = (field: string) =>
  field
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(ROLE, '')

const noneLike = (v: string) => /^(?:none|n\/a|-|—|nothing)\.?$/i.test(v.trim())

/*
 * Swaps and their limits. The 2026-10-20 run swapped people for "a fresh subagent is the nearest step" and
 * never said what a subagent cannot see; the 2026-10-21 review then got past a phrase list with plain words
 * ("rather than a person", "in lieu of people"). So a swap is a nearer-step phrase, or an agent word with a
 * person word and a linking word, and a limit is a "cannot measure/tell/show…" clause that says something.
 */
const AGENT_WORD = /\b(?:sub-?agents?|agents?|llms?|models?|claude|bots?|simulat\w*)\b/i
const PERSON_WORD =
  /\b(?:person|people|humans?|users?|participants?|new hires?|newcomers?|joiners?|testers?|readers?|colleagues?|teammates?|developers?|engineers?)\b/i
const SWAP_PHRASE = /\bnear(?:est|er)\s+step\b|\bclosest (?:we|i) can\b|\bplays? (?:the |a )?(?:newcomer|new hire|joiner|user|person|reader)\b/i
const SWAP_LINK = /\b(?:instead of|rather than|in lieu of|in place of|stands? in|stand-?ins?|role-?plays?|substitut\w*|proxy for|as a proxy)\b/i
const isSwap = (text: string) => SWAP_PHRASE.test(text) || (SWAP_LINK.test(text) && PERSON_WORD.test(text) && AGENT_WORD.test(text))
/** "cannot measure: where a person gets lost", "can't tell whether …", "does not show what …": the words after it must say something. */
const LIMIT = /\b(?:cannot|can['’]t|can not|does not|doesn['’]t|will not|won['’]t)\s+(?:measure|tell|show|see|catch|capture|judge|detect|test)\b[\s:]*([^;.)]*)/i
const says = (v: string | undefined) => v !== undefined && v.trim() !== '' && !/^(?:nothing|none|n\/a|-|—)\b/i.test(v.trim())
const hasLimit = (text: string, limit?: string) => (limit !== undefined ? says(limit) : says(text.match(LIMIT)?.[1]))

const BY_AGENT = (reader: string) =>
  `Done when, ${reader}: a person's need is tested only by an agent: name a person in "run by", and a stated limit does not replace that`

/** Methods only people can carry out. Named without a nearer step on their own line, they get swapped quietly at Go. */
const NEEDS_PEOPLE =
  /\bthink-?aloud\b|\busability (?:tests?|testing|sessions?|stud(?:y|ies))\b|\buser (?:interviews?|tests?|testing|stud(?:y|ies)|research)\b|\binterviews?\b|\bfocus groups?\b|\bdiary stud\w+|\bcard sort\w*|\bwatch(?:es|ing)? (?:two |three |\d+ |a few |real )?(?:people|users|new hires|newcomers)\b/i

/** Words in order, lower case, for comparing a quote with the request. */
const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? []
const singular = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)

/**
 * A reader's head noun: the last word before "using", "with", "who" and the like, so "first joiner using an AI
 * agent" is a joiner and "Claude Code's skill loader" a loader (2026-10-21 review: any machine word in the reader
 * used to skip every person check). An -ing word after a noun ends it too, so "the AI agent doing the build" is an
 * agent (2026-10-22 E2 replay: it was read as "build", a person), while "coding agent" and "the coding agent" stay
 * agents: there the -ing word opens the reader or follows a determiner.
 */
const DETERMINER = new Set(['the', 'a', 'an', 'our', 'his', 'her', 'their', 'my', 'your', 'its', 'this', 'that'])
function headNoun(reader: string): string {
  const core = reader.toLowerCase().split(/\b(?:using|with|who|whom|in|on|for|at|from|via|through|of)\b/)[0] ?? ''
  const toks = core.split(/\s+/).filter(Boolean)
  const cut = toks.findIndex((t, i) => i > 0 && /^[a-z]{2,}ing$/.test(t) && !DETERMINER.has(toks[i - 1] ?? ''))
  const kept = (cut === -1 ? toks : toks.slice(0, cut)).join(' ')
  return singular((kept.match(/[a-z]+/g) ?? []).at(-1) ?? '')
}
const MACHINE = new Set(['agent', 'subagent', 'claude', 'llm', 'model', 'bot', 'loader', 'ci', 'script', 'tool', 'pipeline', 'harness', 'ide', 'codebase', 'repo', 'repository'])
/** A reader that is a person (or a team), not a program or a thing. */
export const isPersonReader = (reader: string) => !MACHINE.has(headNoun(reader))

/** The "run by …" clauses of a line: who runs its tests. Only these count, never a person word elsewhere in it. */
const runners = (text: string) => [...text.matchAll(/\brun by\s+([^;.()]+)/gi)].map(m => (m[1] ?? '').trim())
/** Claude speaking of itself ("me"), or any agent. */
const AGENT_RUNNER = /\b(?:claude|me|sub-?agents?|agents?|llms?|models?|bots?|scripts?|ci|harness)\b/i
const PERSON_RUNNER =
  /\b(?:you|owner|him|her|them|they|person|human|people|someone|colleague|teammate|team|newcomer|joiner|hire|analyst|manager|user|reader|engineer|developer|expert|senior)/i
/** "the owner or a newcomer he names" is a person; "Claude" or "me" (Claude in its own reply) is not. */
const personRuns = (runner: string) => PERSON_RUNNER.test(runner) && !AGENT_RUNNER.test(runner.split(/\bor\b/)[0] ?? '')

/*
 * The people the request is about: newcomer words anywhere, and any person noun followed within 80 characters
 * by a knowledge gap ("finance analysts ... never used Python", "product manager ... I can't code"). A person
 * merely mentioned ("so I can talk to the engineers") is not one of them.
 */
const NEWCOMER = /\b(first[- ]joiners?|new[- ]joiners?|joiners?|new[- ]hires?|newcomers?|beginners?|juniors?|interns?|trainees?)\b/gi
const PERSON_NOUN =
  /\b((?:product |project |finance |data |business )?(?:managers?|analysts?|designers?|developers?|engineers?|users?|customers?|students?|teammates?|stakeholders?|testers?|operators?|admins?|accountants?|marketers?))\b/gi
const GAP = /\b(?:knows? nothing|never used|new to|can['’]?t code|cannot code|no experience|not technical|non-technical|don['’]?t know|do not know|no background)\b/i
const normalNoun = (noun: string) => {
  const w = noun.toLowerCase().replace(/-/g, ' ').split(/\s+/)
  return [...w.slice(0, -1), singular(w.at(-1) ?? '')].join(' ')
}
function namedPersons(request: string): { noun: string; self: boolean }[] {
  const found = new Map<string, boolean>()
  const self = (at: number) => /\bI(?:'m|’m| am) (?:a |an |the )?(?:\w+ ){0,2}$/i.test(request.slice(Math.max(0, at - 30), at))
  for (const m of request.matchAll(NEWCOMER)) found.set(normalNoun(m[1]!), self(m.index ?? 0))
  for (const m of request.matchAll(PERSON_NOUN)) {
    const end = (m.index ?? 0) + m[0].length
    if (GAP.test(request.slice(end, end + 80))) found.set(normalNoun(m[1]!), self(m.index ?? 0))
  }
  return [...found].map(([noun, isSelf]) => ({ noun, self: isSelf }))
}
const readerIs = (reader: string, person: { noun: string; self: boolean }) =>
  reader.toLowerCase().includes(person.noun.split(' ').at(-1)!) || (person.self && /\b(?:you|owner|me)\b/i.test(reader))

/** Why a quote cannot hold a test to the request, or null when it can: at least 3 words, and 3 in 4 of them his. */
function quoteGap(quote: string, request: string): string | null {
  const q = words(quote)
  if (q.length < 3) return 'is too short to hold the test to the request'
  const his = new Set(words(request))
  return q.filter(w => his.has(w)).length / q.length >= 0.75 ? null : 'is not in the request'
}

/** Where a quote starts in the request, in words (its first three words, matched loosely), or -1. */
function quoteAt(quote: string, request: string): number {
  const q = words(quote).slice(0, 3)
  const r = words(request)
  for (let i = 0; i + q.length <= r.length; i++) if (q.every((w, k) => singular(r[i + k]!) === singular(w))) return i
  return -1
}

/** Is the quote about this reader: it holds the noun, or starts within four words after it ("first joiner who know nothing …")? */
function quoteAbout(quotes: readonly string[], noun: string, request: string): boolean {
  const head = noun.split(' ').at(-1)!
  const r = words(request).map(singular)
  const at = r.indexOf(head)
  return quotes.some(q => {
    if (words(q).map(singular).includes(head)) return true
    const start = quoteAt(q, request)
    return at >= 0 && start > at && start - at <= 4
  })
}

/** The words a quote asks for, without its filler and the reader's own name. */
const FILLER = new Set(
  ('the and for with from that this are was were when which who whom what about know knows nothing knowledge understand ' +
    'learn like also into some something more help make need want able them they their your each every much many thing ' +
    'things read check use used using hand never does exist get all any new first joiner joiners write build create give ' +
    'show tell how can could would should will may might but have has had not you explain explains better helpful info ' +
    'just really very good best way ways').split(' '),
)
function keyWords(quote: string): string[] {
  return [...new Set(words(quote).filter(w => w.length >= 3 && !FILLER.has(w)))]
}
/**
 * A quote that states a limit of the reader ("never used Python", "I can't code") is not a need the test must
 * repeat: the guide must work without Python. A gap of knowledge ("know nothing about the domain") is one: the
 * reader must come away knowing it. Found 2026-10-21 in 10 good replies the card flagged for "python" and "code".
 */
const LIMIT_QUOTE = /\b(?:never used|can['’]?t code|cannot code|not technical|non-technical|no access)\b/i
/**
 * Same word up to its ending or a typo: they share all but the last letter of the shorter one and at least 4
 * ("risky" and "risks"), or their first 5 letters ("approach" and his "approoach").
 */
const sameStem = (a: string, b: string) => {
  if (singular(a) === singular(b)) return true
  if (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5)) return true
  const need = Math.max(4, Math.min(a.length, b.length) - 1)
  return a.length >= 4 && b.length >= 4 && a.slice(0, need) === b.slice(0, need)
}
const covers = (text: string, key: string) => words(text).some(w => sameStem(w, key))

/**
 * What a ++panel draft lacks against its prompt: five experts from different fields, two of them
 * critics, each with specific methods, and little said outside the panel. `outside` is how many
 * characters of the reply sit outside its panel block.
 * With `done` (the "Done when, <reader>:" lines; absent on a card from before 0.9.1) it also needs at least
 * one, each with a reader and a test; every swap must say what it cannot measure; and for each person reader:
 * a "run by" that names a person (a stated limit never replaces it), a quote of the request about them, and a
 * test that uses the quoted words. With `request` (absent on older cards) each person the request names by a
 * newcomer word or a knowledge gap needs a line.
 * Why: 2026-10-20 a subagent stood in for the new joiner and the result never covered "the domain knowledge
 * and tech stack"; the 2026-10-21 review showed each check that 0.9.2 still let through.
 */
export function lintPanel(
  experts: readonly PanelExpert[],
  userOnly: readonly string[] = [],
  outside = 0,
  done?: readonly PanelDone[],
  request?: string,
): string[] {
  const out: string[] = []
  if (experts.length !== 5) out.push(`${experts.length} experts, not five`)
  const critics = experts.filter(x => x.critic).length
  if (critics !== 2) out.push(`${critics} marked as critics, not two`)
  const seen = new Map<string, string>()
  for (const x of experts) {
    const key = fieldKey(x.field)
    const prior = seen.get(key)
    if (prior === undefined) seen.set(key, x.field)
    else if (prior.toLowerCase() === x.field.toLowerCase()) out.push(`${x.field} appears twice: the fields should differ`)
    else out.push(`${prior} and ${x.field} look like the same field`)
    const methods = x.methods.split(/[,;]|\band\b/).map(m => m.trim().replace(/\.$/, '')).filter(m => m !== '')
    if (x.work === '' && x.methods === '') out.push(`${x.field}: nothing they would do`)
    else if (methods.length === 0 || noneLike(x.methods)) out.push(`${x.field}: no methods named`)
    else if (methods.every(m => GENERIC.test(m))) out.push(`${x.field}: only generic methods ("${x.methods}")`)
    const line = `${x.work} ${x.methods}`
    const swapped = x.swap !== undefined || isSwap(line)
    if (swapped && !hasLimit(line, x.limit)) out.push(`${x.field}: names a nearer step but not what it cannot measure`)
    // only a nearer step on this very line clears it: a person running some other test does not
    if (!swapped && NEEDS_PEOPLE.test(line)) {
      out.push(`${x.field}: needs people Claude does not have: add "nearest step: …; cannot measure: …" to this line`)
    }
  }
  const hasRequest = request !== undefined && request.trim() !== ''
  // warnings about the person the request is about come first: they are the drift the card exists for
  const first: string[] = []
  const persons = hasRequest ? namedPersons(request) : []
  if (done !== undefined) {
    if (done.length === 0) out.push('no "Done when, <reader>:" line: name each reader of the result and the test that settles it')
    if (hasRequest) {
      for (const p of persons) {
        if (!done.some(d => readerIs(d.reader, p))) first.push(`no done-when line for "${p.noun}", whom the request names`)
      }
    }
    for (const d of done) {
      const sink = persons.some(p => readerIs(d.reader, p)) ? first : out
      if (d.reader === '') {
        sink.push(`a done-when line names no reader: "${d.test.slice(0, 60)}"`)
        continue
      }
      if (d.test === '' || noneLike(d.test)) {
        sink.push(`Done when, ${d.reader}: no test`)
        continue
      }
      if (isSwap(d.test) && !hasLimit(d.test)) sink.push(`Done when, ${d.reader}: names a nearer step but not what it cannot measure`)
      if (!isPersonReader(d.reader)) continue
      // a person reader from here on: a person runs a test, and no stated limit replaces that
      const who = runners(d.test)
      if (who.length === 0) sink.push(`Done when, ${d.reader}: say who runs the test ("run by …")`)
      else if (!who.some(personRuns)) sink.push(BY_AGENT(d.reader))
      // a reader the request only implies ("later maintainer") has none of its words: "(implied)" says so on the card
      if (!hasRequest || d.implied === true) continue
      const quotes = d.quotes ?? []
      if (quotes.length === 0) {
        sink.push(`Done when, ${d.reader}: quote the words of the request this reader needs`)
        continue
      }
      const gaps = quotes.map(q => [q, quoteGap(q, request)] as const)
      const held = gaps.filter(([, gap]) => gap === null).map(([q]) => q)
      if (held.length === 0) {
        const [q, gap] = gaps[0]!
        sink.push(`Done when, ${d.reader}: "${q}" ${gap}`)
        continue
      }
      // the quote is about this reader when the request names them
      const named = persons.find(p => readerIs(d.reader, p))
      if (named !== undefined && !named.self && !quoteAbout(held, named.noun, request)) {
        sink.push(`Done when, ${d.reader}: quote the request's words about the ${named.noun}`)
      }
      // and its test uses the words each quoted need is made of (half of them at least), outside the quote and the
      // runner; a quote that only states a limit of the reader is not a need to repeat
      const body = d.test.replace(/"[^"]*"|“[^”]*”/g, ' ').replace(/\brun by\s+[^;.()]+/gi, ' ')
      const missing = held
        .filter(q => !LIMIT_QUOTE.test(q))
        .map(q => keyWords(q))
        .filter(keys => keys.length > 0 && keys.filter(k => covers(body, k)).length / keys.length < 1 / 2)
        .flatMap(keys => keys.filter(k => !covers(body, k)))
      if (missing.length > 0) sink.push(`Done when, ${d.reader}: the test leaves out the need it quotes: ${[...new Set(missing)].join(', ')}`)
    }
  }
  if (outside > PANEL_OUTSIDE) out.push('the reply says more outside the panel: read it before Go, it may ask something or start the work')
  out.push(...userOnlyHits(experts.map(x => `${x.work} ${x.methods}`).join('\n'), userOnly, 'Claude cannot call it, so you type it', true))
  return [...first, ...out]
}

/**
 * A warning for each user-only skill the text calls as /name (quoted or not), but not /name.md or
 * /name/path. With `typedOk`, a mention just after "type" ("I'll type /x", "you type /x yourself")
 * is the user's own step, as a ++deep rewrite or a panel is told to write it, and is not flagged.
 */
function userOnlyHits(args: string, userOnly: readonly string[], why: string, typedOk = false): string[] {
  return userOnly
    .filter(name => {
      for (const m of args.matchAll(new RegExp(`(^|[^\\w/.-])/${escape(name)}(?![\\w/-]|\\.\\w)`, 'gi'))) {
        const at = (m.index ?? 0) + (m[1]?.length ?? 0)
        if (typedOk && /\btyp(?:e|es|ing)\b[^.;\n]{0,25}$/i.test(args.slice(Math.max(0, at - 40), at))) continue
        return true
      }
      return false
    })
    .map(name => `/${name} is user-only: ${why}`)
}

/**
 * The name a SKILL.md is called by when its frontmatter makes it user-only
 * (`disable-model-invocation: true`, also `True`, quoted, or with a comment), else null.
 * `folder` is the fallback name.
 */
export function userOnlyName(skillMd: string, folder: string): string | null {
  const front = skillMd.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!front) return null
  const body = front[1] ?? ''
  if (!/^disable-model-invocation:\s*["']?true["']?\s*(?:#.*)?$/im.test(body)) return null
  const name = body.match(/^name:\s*["']?([\w:.-]+)["']?\s*$/m)?.[1]
  return name ?? folder
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

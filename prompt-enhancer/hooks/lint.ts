// Checks on a drafted /goal or /loop that need no model call. Each rule is a
// fact about how the commands work (Claude Code 2.1.302, read from the build):
// the /goal judge is a small model that runs nothing and reads only the
// conversation; nothing counts turns for Claude or the judge; a reached cap is
// judged met; a loop pass gets a user-only skill as plain text. A ++deep draft
// gets two more: its proof must be something outside the two of us, and its
// rewrite must stay about the size of the request. A ++panel draft is held to
// its own prompt: five experts, different fields, two critics, methods named.

import type { PanelExpert } from '../types'

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

/**
 * What a ++panel draft lacks against its prompt: five experts from different fields, two of them
 * critics, each with specific methods, and little said outside the panel. `outside` is how many
 * characters of the reply sit outside its panel block.
 */
export function lintPanel(experts: readonly PanelExpert[], userOnly: readonly string[] = [], outside = 0): string[] {
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
  }
  if (outside > PANEL_OUTSIDE) out.push('the reply says more outside the panel: read it before Go, it may ask something or start the work')
  out.push(...userOnlyHits(experts.map(x => `${x.work} ${x.methods}`).join('\n'), userOnly, 'Claude cannot call it, so you type it', true))
  return out
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

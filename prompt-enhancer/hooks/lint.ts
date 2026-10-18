// Checks on a drafted /goal or /loop that need no model call. Each rule is a
// fact about how the commands work (Claude Code 2.1.302, read from the build):
// the /goal judge is a small model that runs nothing and reads only the
// conversation; nothing counts turns for Claude or the judge; a reached cap is
// judged met; a loop pass gets a user-only skill as plain text.

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

/** A warning for each user-only skill the text calls as /name (quoted or not), but not /name.md or /name/path. */
function userOnlyHits(args: string, userOnly: readonly string[], why: string): string[] {
  return userOnly
    .filter(name => new RegExp(`(^|[^\\w/.-])/${escape(name)}(?![\\w/-]|\\.\\w)`, 'i').test(args))
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

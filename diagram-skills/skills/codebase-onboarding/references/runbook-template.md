# Templates: RUNBOOK.md, AGENTS.md, a per-repo fix-issue skill

## Rules for every line

- A fact names **a file and a symbol** (`parser/ical/component.py`, `handle_begin_component`). Never a line
  number: lines move with every edit, symbols rarely.
- A claim about behaviour says how it was checked: "checked by parsing `BEGIN:X-FOO`, 2026-10-21". If you
  only read it, write *(not run)*. A stale comment is the commonest wrong fact.
- Numbers carry their method and date: "1,203 failed on Windows, Python 3.12, commit `3ecf079a`".
- In AGENTS.md and parts 1–4, leave out anything an agent learns in one `grep` or one file read:
  file-by-file descriptions, class lists. Part 0 is for a person: it says once, briefly, what one look at the
  tree and the manifests shows, because a newcomer needs the shape before the steps. Its facts come from
  `map.md` (Stack, Folders) and cite the manifest or the folder.
- Write for a reader who knows neither the domain nor the stack: define each domain word once, in the glossary.

## RUNBOOK.md skeleton (Diátaxis: one job per part)

```markdown
# <repo> — new-joiner runbook

Built <date> against commit `<sha8>` (<commit date>) of <remote URL>. Facts cite file + symbol.

| Part | Job |
|---|---|
| 0. Orientation | What it is for, what it runs on, where things live |
| 1. First hour | Tutorial: do it once, in order |
| 2. How-to | Recipes for common tasks |
| 3. Reference | Look-up: commands, module map, glossary |
| 4. Explanation | Why the code is shaped this way |
| 5. Knowledge transfer | Questions for the handover, and how to ask them |

## 0. Orientation (for a person, about 250 words)
**What it is for.** Two or three plain sentences: who uses it and what it does for them, quoting the
README's own line (with the file). No feature list.

**What it runs on.** From `map.md` § Stack; versions as the manifest writes them.
| Layer | Name and version | Declared in |
|---|---|---|
| Language / runtime | | |
| Framework | | |
| Database, queue, cache | | |
| Build and test | | |

**Where things live.** From `map.md` § Folders: each top-level folder, and the main source folder one level
down, with what lives there in a few words and its file count. Name the deployment, migration, config and
scripts folders too, even when this runbook does not cover them (then say so under *Not covered*).

**How the parts meet.** One sentence that points at the traced flow in part 4 and its diagram.

## 1. First hour (tutorial)
1. Install. The documented route (file), and what to do where it fails on this platform.
2. Run the whole suite and save the baseline (baseline.py). The expected failures on this platform, grouped
   by cause, with the CI platform for contrast. "Judge your change by the difference, not by all green."
3. Run the program once on a tiny input and look at what comes back (a 5-line snippet).
4. Run one test file. Note fixtures that multiply tests (parametrized providers, databases).
5. Read one regression test end to end: where they live, how they are named.

## 2. How-to recipes
### Fix a bug
Issue first (and the AI policy, if any) → search for an earlier partial fix → failing test, named the way
this repo names them → trace (the dispatch path from section 4) → smallest fix → full suite vs baseline →
change-log fragment in this repo's format → commit message rules.
### <the 2–4 other tasks a newcomer meets first>
(add a value type, add an endpoint, run the formatter, regenerate a fixture …)

## 3. Reference
### Commands
| Task | Command |
### Module map — where change happens
The map_repo.py hotspot table (top 8) with its method line; the top fan-in files and what a change there touches.
### Domain glossary
One line per domain word, each with the code name it maps to (`VALUE` parameter → `TypesFactory.for_property`).
### The repo's own docs
From `map.md` § Docs: the READMEs, `docs/` files and decision records a newcomer will find, and which to trust.
| Doc | Code commits since its last edit | Checked against the code? | What disagrees |
|---|---|---|---|
Fill "checked" for every doc this runbook quotes or links, and for the three with the most commits since.
### Conventions
Test naming, fixture folders, change-log format, branch and review rules, AI policy (quote the file).

## 4. Explanation — how it fits together
The traced flow from stage 3, in prose, with the sequence diagram embedded. Then the 3–5 design facts that
surprise newcomers (two ways to store a value that behave differently; a pluggable provider; a tolerant vs
strict error path), each checked by running. Each design fact also says where its *why* comes from:
*(origin: commit `<sha8>`, PR #N)* when the commit message, the pull request or its linked issue gives the
reason, or *(origin not recorded: inferred from <what>)* when nothing does. An inferred reason is a question
for part 5, not a fact.

## 5. Knowledge-transfer session
Start from `kt_bank.py skeleton` (the bank's How to ask, then every must-ask in six sessions); gate with
`kt_bank.py check`. A newcomer may not have the vault, so the How to ask stays copied in.

### How to ask
(The bank's follow-up ladder, its "Instead of … ask …" table and its advice for hard answers.)

### Session 1 — The business (A, B)
1. ★ [B2] "Could you walk me through one permit application from submission to approval, with a real case?"
   Why: the flow in part 4 shows the system side only (`handlers/submit.py`, `submit_application`).
   Listen for: each step with who does it and how long it takes, and where to follow a case in the system.

(Sessions 2 to 4 follow the bank: C–E how it works, K the code, F–H where it runs. Session 4 starts with
the system-context diagram when the repo deploys as a service.)

### Session 5 — Speed and running it (I, J)
14. ★ [I3] "A request is stored in a 64 KB column; what is the biggest request you have seen?"
   Why: `models/request_log.py` maps the body to a text column (`RequestLog.body`); 83 KB failed (ran).
   Listen for: a size from a real log or ticket, and what happens to a request that is too big.

(Session 6 covers M and L: AI parts, skipped when the repo has no model, and taking over.)

Skipped: C7 — no screens: the repo is an API only.

## Not covered
What you deliberately left out, so nobody mistakes silence for "does not exist". Then this table, every row
filled: business behaviour often lives outside the code you read.

| Where behaviour hides | Looked? | What you found, or the files you did not open |
|---|---|---|
| Scheduled jobs (cron, CI schedules, job runners) | yes / no / none in repo | |
| Config and feature flags (config files, env vars, flag services) | | |
| The database (migrations, triggers, stored procedures, constraints) | | |
| Infrastructure (Compose, Kubernetes, Terraform, proxies) | | |
| Production-only data (inputs only real records reach) | | |
| Behaviour nobody decided (open questions, issues no maintainer answered) | | |
```

## AGENTS.md (about 200 words; only what the code does not say)

```markdown
# AGENTS.md — <repo>

Only what an agent cannot read from the code. Overview: see RUNBOOK.md.

## Commands
- Tests: `<command>`. Full suite: about <N> s.
- On <platform> the suite has ~<N> failures before any change (<causes>). Save a baseline first and judge a
  change by the difference.

## Rules that differ from defaults
- <a behaviour that surprises: two APIs that look alike and are not>
- <a test matrix the agent must keep green: both providers, both databases>
- A bug fix gets a regression test `<path pattern>` and a fragment `<path pattern>`.
- AI policy: <quote the repo's rule, with its file>.
```

## Per-repo fix-issue skill (optional, user-invoked)

A procedure, never a code summary. Pilot version: icalendar's, 10 steps.

```markdown
---
name: <repo>-fix-issue
description: "Fix a GitHub issue in <repo>: reproduce it as a failing regression test, trace it, fix, compare
  with the saved test baseline, add the change-log fragment and the AI-policy commit message. Use when asked to
  fix a <repo> bug or issue number."
disable-model-invocation: true
---

1. Read the issue and every maintainer comment. A maintainer's decision counts even mid-thread. If no
   maintainer has decided the expected behaviour, stop and ask.
2. Search the change-log folder and the tests for the issue number, then for the topic words: part of the fix
   may already be merged.
3. If the baseline file does not exist, run the full suite and save it.
4. Write the regression test (<path pattern>; docstring: the rule, then the issue URL).
5. Run it. It must fail for the reason in the issue, not for a typo.
6. Trace: <the dispatch path from RUNBOOK section 4>.
7. Fix the smallest thing that makes the test pass. Keep <the test matrix> green.
8. Run the full suite and diff it with the baseline. Any new failure is yours.
9. Add the change-log fragment. If AI helped, say so there too.
10. Commit message: what and why, `Fixes #<N>`, and <the AI-policy fields>.
```

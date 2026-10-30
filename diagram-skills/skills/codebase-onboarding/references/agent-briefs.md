# Agent briefs

Fill the `{…}` fields and paste. Each brief stands alone: a fresh agent has none of your context, and it must
not get your reasoning, the answer key or the fix. Use forward slashes in every path.

`{INTERPRETER}` / `{RUN_COMMAND}` is the command that worked in stage 3, written out in full. Examples:
Python `C:/W/venv/Scripts/python.exe -c "import pkg; print(pkg.f(1))"` with `PYTHONPATH=src`;
TypeScript `node --no-warnings --experimental-transform-types --input-type=module -e "import {f} from './src/index.ts'; console.log(f(1))"`.

## Flow trace (stage 3, optional helper)

`subagent_type: "Explore"`

```
Trace what happens when {ENTRY} runs on {INPUT} in the repository at {REPO}. Read-only: do not edit, install
or delete anything, and do not read outside {REPO}. You may run snippets with {INTERPRETER} from {REPO} to
confirm the order (a print or a breakpoint), and you should: comments in this code may be out of date.

Output, and nothing else:
1. Numbered steps, at most 25, each as: file — symbol — what it does with the data. Mark each step [ran] if
   a snippet confirmed it or [read] if you only read it.
2. Every comment or docstring you found that disagrees with what the code did, with file and symbol.
3. The 3 places where a newcomer would most likely make a wrong change, with one sentence each.
Do not record assumptions or notes for the user with any tool.
```

## Fact-checker (stage 5)

`subagent_type: "Explore"` (it can run read-only commands and snippets; the 2026-10-21 reviewer did). Give it
the sheet and the repo, nothing else: not the runbook, not the key, not the rest of W.

```
Check every claim in {SHEET} against the repository at {REPO}. Read the instructions at the top of the
sheet first. Read-only: do not edit, install or delete anything, and do not read outside {REPO} and the sheet.
A claim about behaviour must be checked by running code, from {REPO}, like this: {RUN_COMMAND}
Running a snippet changes nothing, so it is allowed and expected.
Some claims are false; you are not told how many.

Output exactly one line per claim, in the sheet's order and format:
<number>: <TRUE|FALSE|PARTLY|UNSURE> - <file and symbol, one sentence of evidence>
Then nothing else. Do not record assumptions or notes for the user with any tool.
```

## Cold-start bug fixer (stage 7)

`subagent_type: "general-purpose"`, one agent per arm, all dispatched in one message so no arm learns from
another. The briefs of the two arms are word for word the same except the paragraph marked NOTES.

```
You are a developer on your first day in this codebase. Fix the bug described in {ARM}/ISSUE.md.

Your workspace is {ARM}. The code is in {ARM}/repo. Work only inside {ARM}: do not read, list or search
its parent folder or anything else outside it. Do not use the web, a package registry or any other copy of
this project. The fix must come from you and the code in front of you.

NOTES (ctx arms only): Before you start, read every file in {ARM}/notes/. They were written for newcomers to
this repo. Use them as you judge best.

Run tests from {ARM}/repo with: {TEST_COMMAND}
{ENVIRONMENT, e.g. "Set PYTHONPATH=src. The interpreter is C:/…/python.exe." It must import the code in
{ARM}/repo: an interpreter with the real repo installed in editable mode would run the fixed code instead.
Dependencies are already installed; do not install anything.}

Rules:
- Deliver what a maintainer would merge: the fix and a regression test for it.
- If the issue leaves the expected behaviour undecided, do not stop: choose one, and say in your report that
  it was undecided and what you chose.
- Do not commit. Do not write outside {ARM}. Do not record assumptions or notes for the user with any tool:
  your report is your only output.

Report, under 300 words:
1. Files changed, and why.
2. Tests added, and the test runs you made (command and result) before and after the fix.
3. Anything in the issue you found undecided or ambiguous, and what you chose.
4. Where you got stuck, and what got you unstuck.
5. (ctx arms) Which note helped, which misled, and what was missing.
```

Grade the arms only when every agent has returned: grading copies the hidden tests into the private folder,
and no agent should be running then. Read each report after its grade. Add every stuck point and every
"missing" note to the runbook, and keep a list of what you changed and why: the user gets it.

## Improvements (stage 8)

`subagent_type: "Explore"`

```
You suggest improvements for the repository at {REPO}, for a person who is new to it. Read-only: do not edit,
install or run anything. Read first: {W}/map.md, {W}/arch.json, {W}/vulns.json, {W}/baseline.txt and
{W}/out/RUNBOOK.md.

Write this, and nothing else:
## Code
- <up to 5 changes that would make the code safer or easier to change>. Prompted by: `<file>`
## Business ideas
- <up to 5 ideas the code already makes cheap to try>. Prompted by: `<file>`

Every line ends with "Prompted by:" and one repo file that holds the fact behind it. Code items come from the
hotspots, fan-in, failing baseline tests, docs that drifted from the code and known advisories: say which.
Business ideas are for discussion, not findings: start each from what the code already does (a feature, a data
field, an export), never from claims about users, markets or revenue the repo cannot show. Do not record
assumptions or notes for the user with any tool.
```

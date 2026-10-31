# html-artefact

One skill that builds a single-file HTML page as the result of a thinking job: compare options, review code, tune something with knobs, sort tickets by dragging, edit flags or prompts, present a slide deck, explain one concept, or report status. It adds no hooks or panels.

Claude never starts this skill by itself. You call it by name, after installing:

```
/html-artefact:html-artefact compare three ways to cache our API responses
```

## How it works

- **Pick a recipe.** 24 recipes cover the common jobs: side-by-side code approaches, design directions, an annotated pull request, a module map, a design system, a component variant matrix, an animation sandbox, an interaction prototype, a slide deck, an SVG figure sheet, a status report, an incident timeline, an annotated flowchart, a feature or concept explainer, an implementation plan, a PR write-up, a triage board, a feature-flag editor, a prompt tuner, a one-sheet reference, a blindspot pass, an interview and a change quiz.
- **Look at a real example.** Most recipes point at a reference page from Thariq's ["Unreasonable Effectiveness of HTML"](https://thariqs.github.io/html-effectiveness/) gallery. The skill carries 31 of them, so Claude can open one before it writes.
- **Design for the subject.** Each page gets its own colour and type tokens, a light and a dark theme, and a layout that works at phone width. The pages end in a "done" action, such as Copy as markdown, so the result leaves the page in one click.
- **Audit the file.** `scripts/audit.sh` checks that the page loads nothing it should not, that hidden blocks are toggles and not dead content, and that the page has a title, a viewport, a dark theme and a background. `--kraft-look` also checks the optional kraft-paper palette.

## Install

```
/plugin marketplace add richardmuucyi/rmahwj
/plugin install html-artefact@rmahwj
/reload-plugins
```

## What it needs

- Nothing to build pages: Claude writes the HTML.
- For the audit: bash (Git Bash on Windows) and Python 3, standard library only. Without Python the audit falls back to a plainer grep check.
- Optional: a headless browser such as Playwright, so Claude can take a screenshot of the page and look at it before handing it over.

## What it writes

One `.html` file in the current folder, or in a folder you name. At the end Claude offers to open it with your system's default browser.

A page may load Google Fonts and pinned scripts from five public CDNs when you open it; the audit allows nothing else. Nothing is uploaded.

## Read this first

A skill can run commands with your permissions. Read `SKILL.md` and `scripts/` before you install the plugin.

Developed and tested on Windows 11 with Claude Code 2.1.299. Not tried on macOS or Linux yet. On those, the commands may need `python3` where the skill says `python`.

## Tests

From the skill's folder inside the plugin:

- `python evals/test_audit.py` checks the audit on good and broken fixture pages and on the 31 reference pages (about 2 minutes). Add `--pages <folder>` to also audit pages of your own.
- `python evals/test_reply_builder.py` checks the reply-builder template in a real browser. It needs `pip install playwright` and `playwright install chromium`.
- `evals/evals.json` holds cases for a person to run and judge.

## Notices

The 31 reference pages, the gallery indexes and the palette they share are © Anthropic PBC, under Apache-2.0. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

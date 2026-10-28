# skill-authoring

Two skills for building and improving other skills. Like `diagram-skills`, this plugin adds no hooks or panels. It adds skills: Claude follows a skill's steps and runs its scripts.

| Skill | How it starts | What you get |
|---|---|---|
| `ebook-to-skill` | You call it by name | a skill built from an EPUB, or an audit of an existing skill's structure |
| `skill-uplift` | Claude picks it when your request fits | researched, verified improvements to one of your skills, as a proposal you approve |

## ebook-to-skill

It has two jobs.

- **Build.** Give it an EPUB. It extracts the chapters, plans the skill with you at two checkpoints, writes `SKILL.md` and its references, then audits the result.
- **Audit.** Give it a skill folder. It checks the frontmatter, file sizes, links and wording against a checklist. With `--verify-claims` it also checks a book skill's claims against its chapter files.

Call it with `/skill-authoring:ebook-to-skill`, followed by an EPUB path or a skill folder. Claude does not start it on its own.

## skill-uplift

Ask in your own words, for example "modernise my X skill with current best practice".

1. It reads the skill and proposes research lenses (topics to research), and waits for you to confirm them.
2. It researches each lens. You pick one of two modes:
   - **Mode A** hands each lens to a `/deep-research` workflow. This plugin does not include one. Use Mode B if you have none.
   - **Mode B** runs the lenses in parallel subagents. Each finding faces skeptic subagents that try to refute it, and every cited link is checked.
3. It sorts what survives into **Validations**, **Gaps** and **Net-new**, and proposes edits. It changes no file until you approve.

It does not rewrite a skill's `description`. Its text names other tools for that job and for related ones (`shrink-skill-desc`, `skill-creator`, `self-improving-skills`, `claude-md-improver`). This plugin does not include them.

Mode B makes many model calls: one research subagent per lens, plus up to three skeptics per finding. Expect a large token bill on a big skill.

## Install

```
/plugin marketplace add richardmuucyi/rmahwj-mods
/plugin install skill-authoring@rmahwj-mods
/reload-plugins
```

## What each skill needs

**ebook-to-skill**
- Python 3. The audit script uses the standard library only.
- For EPUB extraction: `pip install beautifulsoup4`. Without it the extractor falls back to a basic HTML parser, and the output is worse.

**skill-uplift**
- Web search and subagents in your Claude Code session. It has no scripts.

## What the skills write

`ebook-to-skill` writes the new skill to `.claude/skills/<slug>/` and scratch files to a folder you name. `skill-uplift` edits only the target skill's folder, and only after you approve. Neither uploads your skills anywhere. `skill-uplift` sends research questions to web search.

## Read this first

A skill can run commands with your permissions. Read a skill's `SKILL.md` and `scripts/` before you install the plugin.

Developed on Windows 11 with Claude Code 2.1.312. Not yet tested as an installed plugin, or on macOS or Linux. On those, the commands may need `python3` where the skills say `python`.

## Tests

- `ebook-to-skill`: run `python scripts/audit_skill.py .` from its folder. It audits the skill itself and should report 0 FAIL.
- `skill-uplift`: no automated tests. `_evals.md` holds trigger and behaviour cases for a person to run and judge.

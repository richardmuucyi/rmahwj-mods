# skill-authoring

Three skills for building and improving other skills. Like `diagram-skills`, this plugin adds no hooks or panels. It adds skills: Claude follows a skill's steps and runs its scripts.

| Skill | How it starts | What you get |
|---|---|---|
| `ebook-to-skill` | You call it by name | a skill built from an EPUB, or an audit of an existing skill's structure |
| `skill-uplift` | Claude picks it when your request fits | researched, verified improvements to one of your skills, as a proposal you approve |
| `self-improving-skills` | Claude picks it when a skill should learn from a run | a gated loop: free capture of lessons, six gates before any lesson changes the skill |

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

It does not rewrite a skill's `description`. Its text names other tools for that job and for related ones (`shrink-skill-desc`, `skill-creator`, `claude-md-improver`). This plugin does not include them. It hands a mid-run discovery to `self-improving-skills`, which is in this plugin.

Mode B makes many model calls: one research subagent per lens, plus up to three skeptics per finding. Expect a large token bill on a big skill.

## self-improving-skills

It lets a skill learn from its own runs without drifting. The rule: **capture is free, promotion is gated.**

- **Capture.** Claude may always append a lesson from a run to the skill's `learnings/NNNN-<slug>.md`. This changes no behaviour.
- **Promotion.** A lesson moves into the skill's `SKILL.md` or `references/` only after six gates: verified, privacy-clean, non-destructive, trigger-safe, scope-confined and regression-checked. Anything that needs judgment is proposed to you first.
- **Log.** Each promotion is appended to the skill's `_self-improve-log.md`, so every change can be traced and undone.

The full rules are in `references/self-improvement-loop.md`. To opt a skill in, paste the adoption block from that file into the skill's `SKILL.md`.

**Staging a change.** `scripts/stage_skill_change.py` copies a skill to a scratch folder, so a proposed change is diffed and tested before it touches the real skill:

```
python scripts/stage_skill_change.py --skills-root ~/.claude/skills stage my-skill
python scripts/stage_skill_change.py diff STAGE
python scripts/stage_skill_change.py test STAGE -- python tests/run.py
python scripts/stage_skill_change.py apply STAGE
```

Run these from the skill's folder. `STAGE` is the folder that `stage` prints.

**Pass `--skills-root` every time you stage.** By default the script looks in the folder it sits in, which inside this plugin holds only this plugin's three skills. Point it at the folder that holds your skill: `~/.claude/skills` for your own skills, or `.claude/skills` in a project. Add `--with <skill>` for each sibling skill your tests import.

`apply` refuses when the real file changed after staging, and it backs up each file it replaces.

**Finding lessons that wait too long.** Capture is easy, so lessons pile up and nobody promotes them. `scripts/ripe_learnings.py` is the sweep for that queue. Run it once a month, for example:

```
python scripts/ripe_learnings.py
python scripts/ripe_learnings.py --root path/to/project --json
```

- It lists lessons graded `corroborated` or `mechanical-fact` that have waited 30 days or more (`--days N` changes that).
- It also reports promoted lessons that hold several findings (one may not have landed), lessons with no confidence grade, and log lines that name no lesson.
- It only reads. It never edits a skill, and it never decides that a lesson should be promoted.
- By default it walks up from its own folder to the first folder that holds `.claude/skills`. Installed as a plugin, that is your home folder, so it scans `~/.claude/skills`. For a project's skills, pass `--root` with the project folder.

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

**self-improving-skills**
- Python 3. Both scripts use the standard library only.
- On Windows it links sibling skills with a directory junction (`mklink /J`), which needs no admin rights. On macOS and Linux it uses a symlink.

## What the skills write

`ebook-to-skill` writes the new skill to `.claude/skills/<slug>/` and scratch files to a folder you name. `skill-uplift` edits only the target skill's folder, and only after you approve. `self-improving-skills` writes lessons and the log inside the target skill's folder, and stages copies in your temp folder (`skill-stage/`). Its sweep, `ripe_learnings.py`, writes nothing: it prints a report. It changes the real skill only on `apply`, after you approve. None of them uploads your skills anywhere. `skill-uplift` sends research questions to web search.

## Read this first

A skill can run commands with your permissions. Read a skill's `SKILL.md` and `scripts/` before you install the plugin.

Developed on Windows 11 with Claude Code 2.1.312. Not yet tested as an installed plugin, or on macOS or Linux. On those, the commands may need `python3` where the skills say `python`.

## Tests

- `ebook-to-skill`: run `python scripts/audit_skill.py .` from its folder. It audits the skill itself and should report 0 FAIL.
- `self-improving-skills`: run `python evals/test_stage_skill_change.py` and `python evals/test_ripe_learnings.py` from its folder. Both run offline. The first prints `ok` and the second `PASS` when they pass.
- `skill-uplift`: no automated tests. `_evals.md` holds trigger and behaviour cases for a person to run and judge.

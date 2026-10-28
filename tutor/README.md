# tutor

One skill you call by name. It quizzes you on material you have already studied, one question at a time, until you reach the edge of what you know. It adds no hooks or panels.

```
/tutor:tutor quiz me on notes/tcp-connections.md until I break
/tutor:tutor --feynman let me explain hash table collisions back to you
```

Claude does not start it on its own. Name what to drill and where it is: a note, a spec, an HTML page, or text you paste.

## Two modes

| Mode | Start it with | What happens |
|---|---|---|
| Adaptive quiz | no flag, "quiz me" | one question per turn, harder after a right answer, easier after repeated misses |
| Feynman teach-back | `--feynman` | you explain; Claude plays a novice and asks about the gaps |

- **A miss is diagnosed, not just marked wrong.** Claude names the specific misconception and gives a hint. It does not give the answer.
- **Completion is earned.** Each concept must be cleared at the target difficulty twice. Then one fresh question per concept, never asked before, must all pass in one sweep.
- **The ledger keeps it honest.** The skill writes `_tutor-session-<date>.md` beside your source file, or in the current folder when the source is not a file. It updates the ledger every turn, so a long session survives a compacted conversation. Say "stop" and it saves a "resume here" note.

## It names other tools

The skill hands off to three tools that this plugin does not include. It works without them.

- **Teach from scratch:** it suggests `/learn` when you have not studied the material yet.
- **Flashcards:** it offers to turn your gaps into an `anki` deck.
- **A study sheet:** for an HTML version of a session, it asks you to run `/html-artefact`. That skill is in this marketplace as its own plugin; installed that way, its command is `/html-artefact:html-artefact`.

## Install

```
/plugin marketplace add richardmuucyi/rmahwj-mods
/plugin install tutor@rmahwj-mods
/reload-plugins
```

## What it needs and writes

- **Needs:** nothing beyond Claude Code. It has no scripts.
- **Writes:** only the session ledger. It uploads nothing.

## Read this first

A skill can change files with your permissions. Read `SKILL.md` and `references/` before you install the plugin.

Developed on Windows 11 with Claude Code 2.1.312. Not yet tested as an installed plugin, or on macOS or Linux.

## Tests

No automated tests. `evals/evals.json` holds three cases for a person to run and judge: an adaptive quiz, a Feynman teach-back, and a request to be taught from scratch, which the skill should route to `/learn`.

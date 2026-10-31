# session-board

A strip above the prompt that shows what needs you, across every Claude Code session on the machine.

- **Other sessions** that need you or are done.
- **This session:** its task bar, the models its subagents use, and the files it touches while it works.
- **A recap** when Claude flags something for you to check, or when assumptions are waiting (see [`assumptions`](../assumptions)).
- **`/sessions`** opens a view with four tabs: Sessions, Turns, Files and Context.

Everything comes from events and `git status`. The only token cost is Claude's one-line summary of each turn.

## Context guard

The guard watches the size of the context.

- **From the advise line** (default 300K tokens), a chip shows the context size, some advice and a **Compact now** button. It also needs the context to be 150K above its size after the last compaction.
- **In `auto` mode,** from the auto line (default 500K), a countdown can start (default 10 seconds) and then compact. It starts only right after a commit or push, with no job running and you not typing. Typing, the Keep going button, or sending a prompt cancels it.
- **Compaction notes** tell every compaction to keep paths, ids and rules.
- **Log:** from 200K, each turn end adds one line (context, grade, whether it would have compacted, the saving) to `~/.claude/session-board/guard/`. The Context tab sums up today's lines.

A compaction costs what any compaction costs.

## Settings

Set them in `/config`, or with `claude plugin configure session-board`. The mode and the countdown length you pick in the Context tab of `/sessions` win over these.

| Setting | Choices | Default |
|---|---|---|
| Context guard mode | `advise` (chip and button only) · `auto` (also counts down and compacts) · `off` | `advise` |
| Advise from (thousand tokens) | 200 · 250 · 300 · 400 | 300 |
| Auto from (thousand tokens) | 400 · 500 · 600 · 700 | 500 |
| Countdown seconds | 5 · 10 · 15 · 30 · 60 · 120 · 300 · 600 | 10 |
| Journal log | on · off | off |

**Journal log** is for the author's own journal workflow. It keeps a daily log of Claude's turns in `~/.claude/session-board/log` for a journal skill to read, and adds a 📓 button to turn cards. Leave it off unless you have such a skill.

## Install

```
/plugin marketplace add richardmuucyi/rmahwj
/plugin install session-board@rmahwj
/reload-plugins
```

## Tests

```
claude plugin test session-board
```

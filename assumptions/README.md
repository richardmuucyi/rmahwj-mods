# assumptions

Claude logs each assumption it makes while it works. You review them, mark them right or wrong, and send a correction in the middle of a task.

## How it works

- The mod gives Claude one tool, `log_assumption`. Claude calls it when it makes a non-trivial assumption you have not confirmed. It can mark an assumption as high impact, and it carries on without waiting.
- `/assumptions` shows what Claude assumed in this session. A side panel shows the same list.
- Mark an assumption right, or mark it wrong and type the fix. If Claude is mid-turn, it reads the correction at its next step. If not, the correction goes in as your next prompt. It reads `Correction to assumption A<n> ("…"): <your fix>` and asks Claude to adjust the work that depended on it.
- If you also install [`session-board`](../session-board), its recap shows how many assumptions are still open. This mod writes the count to a small file in `~/.claude/session-board/`. Nothing reaches the model.

## Install

```
/plugin marketplace add richardmuucyi/rmahwj
/plugin install assumptions@rmahwj
/reload-plugins
```

## Tests

```
claude plugin test assumptions
```

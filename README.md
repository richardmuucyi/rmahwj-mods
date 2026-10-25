# rmahwj-mods

Six small [Claude Code](https://claude.com/claude-code) mods: five by Richard Mah, one by Thariq Shihipar. A mod changes how Claude Code looks or behaves: a strip above the prompt, a panel, a slash command, a hook on your prompts.

| Mod | What it does |
|---|---|
| [`assumptions`](assumptions) | Claude logs each assumption it makes. You review them in a panel, mark them right or wrong, and send a correction mid-task. |
| [`image-open`](image-open) | Paste an image with Alt+V and an `[open]` button appears above the prompt. It opens the full-size picture in your default viewer. Windows only. |
| [`next-steps`](next-steps) | After each turn, up to three likely next prompts appear above the prompt. Press 1, 2 or 3 to put one in the prompt box as a draft, or 0 to dismiss. It makes one extra model call after each turn. By Thariq Shihipar, copied unchanged from [claude-plugins-community](https://github.com/anthropics/claude-plugins-community/tree/main/next-steps) under the MIT licence ([notice](next-steps/THIRD-PARTY-NOTICES.md)). |
| [`prompt-enhancer`](prompt-enhancer) | `++ <request>` makes Claude check your request for gaps and restate it before any work. `++goal` and `++loop` draft a `/goal` or `/loop` for you, `++deep` rewrites a prompt deeper and `++panel` runs it past five experts. Add `!` for grill mode, an interview with no cap on rounds. |
| [`session-board`](session-board) | A strip above the prompt that shows other sessions that need you, plus a `/sessions` view and a context-size guard. |
| [`usage-gauge`](usage-gauge) | Two rows under the prompt: model, cost, tokens, context and your 5-hour and weekly limits. |

## Install

Add the marketplace, then install the mods you want:

```
/plugin marketplace add richardmuucyi/rmahwj-mods
/plugin install assumptions@rmahwj-mods
/reload-plugins
```

Replace `assumptions` with any name in the table. Add the marketplace as `owner/repo`, not as a raw URL.

To get new versions later:

```
/plugin marketplace update rmahwj-mods
```

Auto-update is off by default for marketplaces you did not create. Each mod has a `version` in its `plugin.json`, and an update reaches you only when that number goes up.

## Read this first

A mod runs code inside your Claude Code session, with your permissions. Read a mod's `hooks/` folder before you install it. The code is plain TypeScript, with no build step and no network calls of its own.

Developed and tested on Windows 11 with Claude Code 2.1.299. Not tried on macOS or Linux yet.

## Tests

Each mod has a `tests/` folder. Run one with:

```
claude plugin test <mod-folder>
```

The tests import `claude-code/testing`, so they only run inside Claude Code.

## Licence

[MIT](LICENSE).

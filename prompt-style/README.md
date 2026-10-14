# prompt-style

Draws your own sent prompts and slash commands in a style and colour you pick. Display only; it uses no tokens.

## Settings

Set both in `/config`, or with `claude plugin configure prompt-style`.

| Setting | Choices | Default |
|---|---|---|
| Prompt style | `light row` (pale background, dark text) · `dark row` (deep tint, bright text) · `outline` (coloured ▌ bar and text, no background) | `light row` |
| Prompt colour | yellow · green · blue · purple · orange · red · grey · brown | yellow |

Run `/prompt-colours` to preview every style and colour.

## Install

```
/plugin marketplace add richardmuucyi/rmahwj-mods
/plugin install prompt-style@rmahwj-mods
/reload-plugins
```

## Tests

```
claude plugin test prompt-style
```

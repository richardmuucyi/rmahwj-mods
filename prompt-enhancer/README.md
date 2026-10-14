# prompt-enhancer

Claude checks your request for gaps and restates it before any work starts. No extra model calls.

| You type | What Claude does | Same as |
|---|---|---|
| `++ <request>` | Checks the request for gaps and restates it as a brief before any work | `/clarify <request>` |
| `++goal <request>` | Checks for gaps, then drafts a short, checkable `/goal` for you to start | `/goalify <request>` |
| `++loop <request>` | Checks for gaps, then drafts a safe, self-stopping `/loop` for you to start | `/loopify <request>` |

## Install

```
/plugin marketplace add richardmuucyi/rmahwj-mods
/plugin install prompt-enhancer@rmahwj-mods
/reload-plugins
```

## Tests

```
claude plugin test prompt-enhancer
```

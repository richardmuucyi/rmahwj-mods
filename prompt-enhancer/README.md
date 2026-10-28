# prompt-enhancer

Claude checks your request for gaps and restates it before any work starts. No extra model calls.

| You type | What Claude does | Same as |
|---|---|---|
| `++ <request>` | Checks the request for gaps and restates it as a brief before any work | `/clarify <request>` |
| `++goal <request>` or `++g` | Checks for gaps, then drafts a short, checkable `/goal` with a printed turn cap | `/goalify <request>` |
| `++loop <request>` or `++l` | Checks for gaps, then drafts a safe, self-stopping `/loop` | `/loopify <request>` |
| `++deep <request>` or `++d` | Says what a top professional would do, start from and be proved right by, then rewrites your prompt deeper, not bigger | `/deepen <request>` |
| `++panel <request>` or `++p` | Picks five experts (two of them critics) and a done-when test for each reader of the result, then does the work when you press Go | `/panel <request>` |
| `== <text>` | Checks only your grammar with one small Haiku call; nothing is sent to Claude. Switch it off in `/config` | `/grammar <text>` |

## Grill mode

Add `!` right after the mode: `++!`, `++g!`, `++l!`, `++d!`, `++p!`.

- Claude interviews you round after round, with no cap on rounds or length.
- It keeps a `ledger` of the facts the result needs: settled, open or assumed.
- It drafts only when no line is open, or when you say go or enough.
- Every line of the draft traces back to your request or the ledger.
- It never searches your private notes for facts about you; it asks instead.
- The card flags any fact it still had to guess.

Use it when the job is big or the request is thin. For a quick job, the plain mode is faster.

## Critics run as fresh subagents

Since 0.11.0 the critics review the work with a clean context, never the author's notes or reasons:

- `++panel`: after the work is written, each of the two critics runs as its own subagent on the finished text, with only your request and its own methods. The work ends with a `critics` block, and the card warns when one is missing.
- `++deep`: before the reply, a subagent checks the rewrite against your request for new outputs, invented limits and self-run proofs. Its result is the `critic:` line on the card.

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

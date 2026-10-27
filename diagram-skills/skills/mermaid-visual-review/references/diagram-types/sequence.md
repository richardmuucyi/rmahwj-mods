# Sequence diagram-specific failure modes

This file supplements `references/common-issues.md` for mermaid `sequenceDiagram` diagrams.

## Type-specific issues

### Actor-alignment with long names

When one actor has a much longer name than others (e.g. `Library Management System` vs `DB`), that actor's box renders wider than the rest, making the row of actors look uneven at the top of the diagram.

**Detection:** Actor boxes at the top of the rendered PNG are visibly different widths.
**Fix:** `sequence-shorten-actor-names` — use the shortest unambiguous form, preferring initialisms when every name is long.

### Self-loop label collision

A self-loop message like `A->>A: Validates complex input data with schema check` renders with the label text overlapping the actor's own lifeline or adjacent messages.

**Detection:** Self-loop's curved arrow label crosses into the actor's lifeline column or touches the next message's text.
**Fix:** `sequence-self-loop-note` — replace with a `Note over A: ...` block. Notes render outside the lifeline area and cannot collide with messages.

### parallel fragments without breathing room

`par` / `and` fragments stack multiple messages in the same vertical band. When the messages are long, the fragment border crowds them.

**Detection:** Fragment border is visibly touching the message labels inside it.
**Fix:** Shorten the messages inside the fragment, or split the fragment into smaller `par` blocks.

### Missing participant declaration

If a participant is used in messages but never declared via `participant`, mermaid will auto-create one at the first use. The auto-created order is dictated by message order, not by intent, which can make the diagram read wrong (e.g. Client appears after Server because Server sent the first message).

**Detection:** Actor order in the PNG does not match the logical/temporal order the author expected.
**Fix:** Add explicit `participant X` declarations at the top of the diagram in the desired order.

### Activation bars are asymmetric

`activate X` and `deactivate X` must be balanced. An unbalanced pair leaves a phantom activation running to the end of the diagram, which looks like a bug.

**Detection:** An activation bar extends past its logical scope or past the last message to that actor.
**Fix:** Add the missing `deactivate X` at the correct point.

## Sequence-specific linting tips for self-review

- Count `activate`/`deactivate` pairs — they should match.
- For every message, verify both sides of the arrow point to declared participants.
- Long notes (`Note over`) should have `<br/>` line breaks every ~30 chars; otherwise they overflow horizontally.
- `loop`, `alt`, `opt`, `par` fragments should have a short, meaningful label — untitled fragments confuse readers.

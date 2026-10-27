# State diagram-specific failure modes

This file supplements `references/common-issues.md` for mermaid `stateDiagram` and `stateDiagram-v2` diagrams.

## Type-specific issues

### Notes drift away from their state

`note right of X` and `note left of X` attach notes to states. When the layout changes (e.g. after adding a new transition), the note may end up visually disconnected from X, floating near another state instead.

**Detection:** A note appears closer to a state it is not attached to than to the state named in its declaration.
**Fix:** Inline the note's content into the state itself using `state "X\n(note text)" as X`, or replace with a description block below the diagram.

### Self-transition label collision

A state with a self-transition `X --> X: event` renders the event label on the curved arrow. For long labels or multiple self-transitions, labels collide.

**Detection:** Two self-transition labels overlap, or one label crosses the state's border.
**Fix:** `state-self-transition-rename` — shorten the label, or consolidate multiple self-transitions into one with a compound label.

### Composite state nesting loses detail

Deeply nested composite states (state inside state inside state) can render with inner states at a size that makes their labels unreadable.

**Detection:** Innermost state labels are visibly too small to read at 100% zoom.
**Fix:** Flatten one level of nesting, or split the composite into a separate diagram linked from the parent.

### Forks and joins drawn too thin

`<<fork>>` and `<<join>>` bars render as thin lines that can be mistaken for regular transitions at small sizes.

**Detection:** Fork/join bar is hard to distinguish from an arrow in the render.
**Fix:** No direct mermaid fix — this is a rendering limitation. Add a label next to the fork (e.g. `note right of forkName: parallel branches start`) to make the intent explicit.

## State-specific linting tips

- Every state mentioned in a transition should be explicitly declared with `state "Display Name" as ID` for non-trivial names.
- `[*]` should appear exactly twice: once as the start and once as the end (unless the diagram has no terminal state).
- Composite states use `state Composite { ... }` syntax; make sure braces are balanced.

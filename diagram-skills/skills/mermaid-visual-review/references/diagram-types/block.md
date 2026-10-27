# Block diagram-specific failure modes

This file supplements `references/common-issues.md` for mermaid `block-beta` diagrams.

## Type-specific issues

### A diagonal arrow lands on a corner

An edge is a straight line between two blocks. A target one column across and one row down gets a diagonal arrow, and its head lands on the target's corner.

**Detection:** an arrowhead touches a block's corner instead of the middle of a side (seen: decode service to NSQ queue).
**Fix:** `block-align-and-pad` (put the target in the source's row or column with `space`).

### Blocks cramped against their arrows

The default `padding` is 8px, so a label such as "Decode service" nearly touches the arrows on both sides.

**Detection:** less than one character's width between a label and the arrow beside it.
**Fix:** `block-align-and-pad` (`block.padding: 24`).

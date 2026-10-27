# Multi-board diagrams

A diagram using `layers`, `scenarios` or `steps` cannot be one image. `d2 in.d2 out.svg`
writes a **directory** `out/` -- note it drops the extension, so `out.svg` gives you
`out/`, never `out.svg/`, and a caller that checks the path it passed always concludes the
render failed.

Boards sit **flat** at the root when the file uses only one board keyword, and nest under
`layers/` `scenarios/` `steps/` only when it uses two or more *(verified; see
`references/cli.md`)*. Glob the directory rather than predicting paths -- the render
script does this and reports what was really written. For a single file, use
`--animate-interval=1200` (one animated SVG) or `--target=''` (root board only).

**Splitting a long diagram into boards? Verify the index board against the detail
boards.** The usual reason to split is a sequence diagram grown too tall — and there the
lifeline headers are the reading frame, so past one screenful every arrow is ambiguous
and boards genuinely fix it. But an overview or index board is **authored, not derived**:
it is the one part that did not come from the source, and therefore the one part that can
be wrong. Check that every arc on it corresponds to a real interaction in a detail board:

```bash
python scripts/render.py <name>.d2 -o <name>.svg --check
```

Then read the index's participant pairs against the boards'. A diff that only asks *"did
the split lose anything?"* is blind to this: it happily reports `LOST: none` while the
index asserts a system boundary that does not exist. That happened — an index board
claimed `Billing Service -> Customer` when the detail board only had `API -> Customer`, and the
loss-only check passed it, counting the invention as a harmless addition. **Verify in both
directions, or you have verified one.**

# Fresh-eyes diagram reviewer

You are reviewing a diagram you did not draw. You are given the rendered image, the
text of its labels, and a description of the system it claims to depict. You are
**not** given the author's reasoning, and not the `.d2` source.

That asymmetry is the whole point. The author's diagram encodes the author's mental
model, so any error in that model reproduces silently in the drawing and reads as
correct to them. Your job is to read what the picture *says* and compare it to what
the system *does*.

## What you are given

- **Title:** {TITLE}
- **Genre:** {GENRE}
- **System description:** {SYSTEM_DESCRIPTION}
- **Facts the author declared, with sources:** {DECLARED_FACTS}
- **Rendered image:** {PNG_PATH} — Read this file. Actually look at it.
- **Label text extracted from the SVG:** {SVG_LABELS}

> If the system description is marked NO TRUSTED SOURCE, treat every interaction the
> picture asserts as unverified, and flag any the image alone cannot justify.

## How to work

1. Read the image once.
2. Where a declared fact cites a file or URL, open each cited source **once**. Ask a fetch for
   the sentences about the claim *and* any condition, exception or limit around it — not the
   whole page. A claim that holds only under a condition the picture leaves out is a finding.
   Also check that each citation is the right one for its claim. Quote what decided it.
3. Decide every claim the picture makes — each label, arrow and note, not only the declared
   facts — as held, did not hold, or unverifiable, and list them under `verified_claims`.
4. At most 6 tool calls in total. Open nothing the declared facts do not cite. Stop when every
   claim is decided.

## What to check, in priority order

1. **Semantic mismatch.** Does the diagram assert something the description or a cited
   source contradicts? Wrong direction of a call, a component talking to the wrong
   neighbour, a return path that does not exist, a claim stated without its condition.
2. **Boundary membership.** Is anything inside a container that the container's own label
   excludes? A datastore inside a boundary labelled "stateless — nothing persisted here"
   is the canonical case.
3. **Factual error in a label.** Compare {SVG_LABELS} against {DECLARED_FACTS}. A value in
   the diagram that contradicts a declared fact is a finding. **A label carrying a
   number, product name, or enum that appears in no declared fact is worth flagging as
   unverifiable** — you cannot confirm it, and neither could the author.
4. **Reading order.** Does the flow read in a sensible direction, or does the eye have to
   jump backwards to follow it?

## What NOT to report

- Aesthetic preference — colour, spacing, font.
- Anything the geometry checker already owns: overlaps, clipping, canvas size.
- Suggestions to add content. You are checking what is there, not what is missing —
  unless its absence makes a claim false.

## Output

Return exactly one JSON block and nothing else:

```json
{
  "critical": ["one line per finding that makes the diagram wrong"],
  "polish": ["one line per finding worth fixing but not wrong"],
  "reading_order_ok": true,
  "semantic_mismatches": ["diagram says X, description says Y"],
  "verified_claims": ["claim: held / did not hold / unverifiable, with the quote or file:line that decided it"]
}
```

Empty arrays are the correct answer for a clean diagram. Do not invent findings to
appear useful — a reviewer that always finds something is as useless as one that never
does, and the clean fixture exists to catch exactly that.

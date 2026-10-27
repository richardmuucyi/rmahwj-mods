# Truth Reviewer Subagent Prompt

The template `SKILL.md` Step 3b uses for the optional truth-review pass. It runs **only when
the source declares its facts** with `%% SOURCE:` lines (`scripts/truth_inputs.py` decides).
Modelled on the d2-diagram skill's `agents/reviewer.md`, which caught two errors on a Bitly
architecture diagram that no visual check could see: a 2014 service drawn reading a 2023 store,
and a step order no source states.

This is a different eye from `agents/reviewer.md`. That one judges how the picture looks; this
one judges whether what it says is true. Neither replaces the other.

## Template

````
You are reviewing a diagram you did not draw. You are given the rendered image, the
text of its labels, and a description of the system it claims to depict. You are
**not** given the author's reasoning, and not the mermaid source. Do not open any
`.mmd` file or the markdown block it came from.

That asymmetry is the whole point. The author's diagram encodes the author's mental
model, so any error in that model reproduces silently in the drawing and reads as
correct to them. Your job is to read what the picture *says* and compare it to what
the system *does*.

## What you are given

- **Title:** {TITLE}
- **Diagram type:** {TYPE}
- **System description:** {SYSTEM_DESCRIPTION}
- **Facts the author declared, with sources:** {DECLARED_FACTS}
- **Left out on purpose (do not report as missing):** {NOT_CLAIMED}
- **Rendered image:** {PNG_PATH} — Read this file. Actually look at it.
- **Label text extracted from the rendered SVG** (line breaks inside a label became spaces):
{LABELS}

> If the system description is marked NO TRUSTED SOURCE, treat every interaction the
> picture asserts as unverified, and flag any the image alone cannot justify.

## How to work

1. Read the PNG once.
2. Where a declared fact cites a file or URL, open each cited source **once**. Ask a fetch for
   the sentences about the claim *and* any condition, exception or limit around it — not the
   whole page. A claim that holds only under a condition the picture leaves out is a finding.
   Also check that each citation is the right one for its claim. Quote what decided it.
3. At most 6 tool calls in total. Open nothing the declared facts do not cite. Stop when every
   declared fact is decided.

## What to check, in priority order

1. **Semantic mismatch.** Does the diagram assert something the description contradicts?
   Wrong direction of a call, a component talking to the wrong neighbour, a return path
   that does not exist.
2. **Boundary membership.** Is anything inside a group (subgraph) that the group's own
   label excludes? When the sources come from different years, a component from one era
   drawn talking to one from another is a boundary error even if each fact is true alone.
3. **Factual error in a label.** Compare the labels against the declared facts. A value
   that contradicts a declared fact is a finding. **A label, edge or step number that
   appears in no declared fact is worth flagging as unverifiable.** A step number is a
   claim about order: flag one no source states. The title is a claim too: check it.
4. **Reading order.** Does the flow read in a sensible direction, or does the eye have to
   jump backwards to follow it?

## What NOT to report

- Aesthetic preference — colour, spacing, font, layout engine. `agents/reviewer.md` owns those.
- Geometry: overlaps, clipping, canvas size.
- Anything listed under "Left out on purpose".
- Suggestions to add content — unless its absence makes a claim false.

## Output

Return exactly one JSON block and nothing else:

```json
{
  "critical": ["one line per finding that makes the diagram wrong"],
  "polish": ["one line per finding worth fixing but not wrong"],
  "reading_order_ok": true,
  "semantic_mismatches": ["diagram says X, source says Y"],
  "verified_claims": ["claim: held / did not hold / unverifiable, with the quote or file:line that decided it"]
}
```

Empty arrays are the correct answer for a clean diagram. Do not invent findings to
appear useful — a reviewer that always finds something is as useless as one that never does.
````

## How SKILL.md uses this file

Step 3b runs `python scripts/truth_inputs.py <final.mmd> <final.svg>`. When `run_truth_review` is
false it records "skipped — no %% SOURCE lines" and stops. Otherwise it fills the placeholders
and dispatches the prompt via the `Agent` tool with `subagent_type: "Explore"` (read-only; ~24k
base context against ~85k for `general-purpose`, measured). Step 2 of "How to work" is
what caught a conditional claim that the declared facts alone could not show;
keep it when trimming. Regression fixture: `evals/fixtures/cloud-merge/`.

Placeholders:
- `{TITLE}` — the frontmatter title.
- `{TYPE}` — `extract_blocks.py`'s `diagram_type`.
- `{SYSTEM_DESCRIPTION}` — **assembled from the `%% SOURCE:` lines and what they cite**: the quoted
  passages, or the cited files and URLs for the reviewer to open. Never free-written by the
  agent that ran the review — then the reviewer only checks the model that drew the diagram,
  and the pass is worthless. Where the SOURCE lines cite nothing checkable, write
  `NO TRUSTED SOURCE`.
- `{DECLARED_FACTS}` — the `sources` list, one per line; add the `exempt` list labelled as exempt.
- `{NOT_CLAIMED}` — the `not_claimed` list, or "none".
- `{PNG_PATH}` — absolute path to the final rendered PNG.
- `{LABELS}` — the `labels` list, one per line.

**Known limit**, as in d2-diagram: the reviewer does not reliably catch a wrong *topology* (an
edge drawn to the wrong neighbour), because topology cannot be rebuilt from cited facts alone.

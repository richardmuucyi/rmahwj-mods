---
name: ebook-to-skill
description: >-
  Two modes: turn an EPUB/ebook into a Claude Code skill, OR audit an existing skill's structure (SKILL.md)
  against authoring best practices. Triggers: "turn this book/epub into a skill", a `.epub` path, "audit
  this skill", "check my SKILL.md", "is this skill well-structured". NOT for privacy/leak/hardening audits
  across the library (skill-audit).
disable-model-invocation: true
---

# ebook-to-skill

Two intents in one skill:

| Intent | When | Primary reference |
|---|---|---|
| **Build** (turn an EPUB into a skill) | User provides a `.epub` path or asks to "convert / ingest / make a skill from this ebook" | [references/workflow.md](references/workflow.md) — 5-stage checkpointed pipeline |
| **Audit** (check an existing skill) | "audit this skill", "check my SKILL.md", "is this well-structured?" | `scripts/audit_skill.py` — run with `--verify-claims` for book-derived skills |

Both share the same checklist ([references/audit-checklist.md](references/audit-checklist.md)).

## Do not invoke for

Converting markdown/notes into a skill (that's `skill-creator`); converting a book into something other than a skill (PDF export, Anki cards — use `anki` for that).

## Build workflow (checkpointed)

Run the full workflow in [references/workflow.md](references/workflow.md). Five stages with two review checkpoints — **do not skip checkpoints, and do not run the full pipeline autonomously**. The user has chosen checkpointed mode.

**Quick summary of stages:**

1. **Verify input** — EPUB exists, unzips cleanly, has chapter structure.
2. **Extract** → tmp dir of per-chapter `.md` files. → **CHECKPOINT 1:** confirm chapter mapping with user.
3. **Synthesize SKILL.md** — read chapters strategically, identify named frameworks, write SKILL.md from [references/skill-md-template.md](references/skill-md-template.md).
3.5. **Verify against source** — run `audit_skill.py --verify-claims` against the draft. Every Title-Cased construct, numeric formula, and enumerated list member must appear verbatim in some chapter file. Working names get `*(working name; not from book)*` flags. **Non-optional** — every book skill audited so far has had at least one hallucination at this stage. → **CHECKPOINT 2:** show draft to user.
4. **Build `references/`** — copy chapters into `references/chapters/`, write `index.md` (TOC + named-construct lookup), `glossary.md` (alphabetical terms), `_evals.md` (3 test scenarios). When parallelising via subagents, include the rule *"Verbatim quotes must be exact — grep the chapter file. Do not paraphrase and tag as a quote."* in every subagent prompt.
5. **Audit** — run `scripts/audit_skill.py --verify-claims`, fix every failure, repeat until clean.

## Audit workflow

Used standalone (intent 2) or as stage 5 of build. Script paths in this file are relative to this skill's folder.

```bash
# Mechanical structural checks (frontmatter, line counts, links, voice patterns):
python3 scripts/audit_skill.py <path-to-skill-dir>

# Add factual verification against references/chapters/ (V1–V4):
python3 scripts/audit_skill.py <path-to-skill-dir> --verify-claims
```

Outputs a pass/fail table against every check in [references/audit-checklist.md](references/audit-checklist.md). For each failure, the script prints the offending file/line and the rule. Fix mechanically, re-run.

**Always run `--verify-claims` on book-derived skills.** V1–V4 catch the three recurring hallucination categories (wrong formula / fabricated list / fabricated framework membership) plus derivative-file re-hallucination. See [audit-checklist.md § Known hallucination categories](references/audit-checklist.md#known-hallucination-categories) and [examples.md § Failure case study](references/examples.md#failure-case-study-buy-back-your-time-v1).

When auditing an existing skill (no build context):
1. Read SKILL.md and structure overview first.
2. Run the script (with `--verify-claims` if `references/chapters/` exists).
3. For each failure, propose the concrete fix (don't apply unless user OKs — destructive edits need permission).
4. Re-run until clean.

## Core principles (apply to every skill this produces)

These come from Anthropic's [Skill authoring best practices](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices) plus community patterns (book-to-skill, Skill Seekers). Full rationale in [references/audit-checklist.md](references/audit-checklist.md).

1. **Three-tier progressive disclosure.** Metadata (always loaded) → SKILL.md (loaded when triggered, persists) → bundled files (read on-demand, zero cost until accessed).
2. **Density over completeness.** 1,000-token summary beats 10,000-token excerpt. Synthesise, don't dump.
3. **Practitioner voice.** "Use X when Y" — not "The book explains X". The skill is a how-to, not a book report.
4. **Front-load the frameworks.** Named constructs in the first 30 lines of SKILL.md.
5. **Verbatim core-thesis quote in the first 20 lines.** One bolded, chapter-cited sentence from the book that operationalises its thesis. Gives future Claude sessions the *frame* in a single line; this is the single highest-leverage move in the template. Don't paraphrase — if you can't find a single verbatim sentence that does this work, the book probably lacks a thesis hinge and the skill will be weaker for it.
6. **One-level reference depth.** SKILL.md → `references/foo.md` only. Never SKILL.md → references/a.md → references/b.md (Claude `head`-previews nested files and misses content).
7. **TOC on any reference file >100 lines.** Claude often partially reads — the first 100 lines must reveal full scope.
8. **Per-chapter file split, not monolith.** One book = one giant `book.md` defeats progressive disclosure. Use `references/chapters/NN-slug.md` so Claude loads only what's needed.
9. **Description carries trigger keywords.** It's the only thing Claude sees when deciding to fire the skill. Third person. List the named constructs. Include negative triggers ("do not invoke for X").
10. **Evals before docs.** Write 3 test scenarios first, then verify the skill passes them.

## Anti-patterns (refuse to ship these)

- Dumping the full extracted book as a single `book.md` reference file.
- SKILL.md body over 500 lines (Anthropic's hard ceiling). Target ≤200 for skills that fit comfortably.
- Description in first person ("I can help you...") — breaks discovery.
- **Description leads with a verb** ("Apply...", "Convert...", "Use..."). Lead with a noun phrase — Claude treats verb-led descriptions as workflow instructions and may follow them instead of reading SKILL.md.
- Nested reference depth (SKILL.md → A → B).
- No TOC on a reference file longer than 100 lines.
- Generic boilerplate like "Use this skill when you need to look up API references and find code examples" (the kind of thing skill-seekers' un-enhanced template ships).
- Time-sensitive content tied to specific dates (rephrase such guidance as evergreen pattern instructions instead).
- Inventing tags, page types, or naming conventions not present in the user's existing vault/skill ecosystem — match the house style.
- **Inventing canonical names** for practices the book describes but doesn't title (the "Transformation Sheet" failure). Always flag with `*(working name; not from book)*`.
- **Skipping Stage 3.5 fact verification.** Every comprehensive book skill audited so far has had at least one V-class hallucination at this stage. "The LLM probably got it right" is not a defense.
- **No "Known misreadings" section** in SKILL.md. The single highest-leverage mature-skill content; seed from Stage 3.5 verifier misses.
- **No verbatim core-thesis quote** in the first 20 lines of SKILL.md body. The skill becomes a list of constructs without a frame.
- **Auto-synthesising pairing sources** for a flagship case study. The build LLM will confidently name real-sounding but wrong sources (an author's wrong book, a misnamed report, a fabricated journal). Pairing sources must be supplied by the human at Checkpoint 2 or the section must be omitted entirely.
- **Forcing an empirical-strength-tier rubric on every book.** The Tier 1 / 2 / 3 pattern fits books that argue causal claims (Walker); it produces empty rubrics on framework books (Harari). Don't force it; use specific-claim caveats in `Known misreadings` instead when the rubric doesn't fit.

## What this skill is *not*

- Not a generic skill builder — for non-book skills, use `skill-creator:skill-creator`.
- Not a PDF or DOCX converter — EPUB only by design (PDF chapter detection is unreliable; ask the user to convert via Calibre first if needed).
- Not a content summariser — synthesis quality is the human-in-the-loop's job at Checkpoint 2. The skill enforces structure, not insight.
- Not an automatic publisher — never uploads or shares skills externally. Outputs stay on disk at `.claude/skills/<slug>/` for the user to inspect.

## Reference

- [references/workflow.md](references/workflow.md) — the 5-stage build workflow with checkpoint prompts.
- [references/skill-md-template.md](references/skill-md-template.md) — annotated SKILL.md template with placeholders.
- [references/audit-checklist.md](references/audit-checklist.md) — every check the auditor enforces, with rationale and Anthropic source links.
- [references/examples.md](references/examples.md) — annotated examples (`buy-back-your-time`, `surrounded-by-idiots`) showing the pattern in production.
- [scripts/extract_epub.py](scripts/extract_epub.py) — deterministic EPUB → per-chapter markdown extractor.
- [scripts/audit_skill.py](scripts/audit_skill.py) — static auditor against the checklist.

# Audit checklist

Most checks below are enforced by `scripts/audit_skill.py` (a few — R5, R6, R7, S3 — are manual / not yet script-enforced). This document is the rationale — what each rule means and where it comes from.

Sources:
- Anthropic, [Skill authoring best practices](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices)
- Anthropic Engineering, [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- Community: [book-to-skill](https://github.com/virgiliojr94/book-to-skill), [Skill Seekers](https://github.com/yusufkaraaslan/Skill_Seekers)

## Contents

- [Frontmatter checks](#frontmatter-checks)
- [SKILL.md body checks](#skillmd-body-checks)
- [Reference file checks](#reference-file-checks)
- [Structural checks](#structural-checks)
- [Content checks](#content-checks)
- [Book-specific checks](#book-specific-checks)
- [Fact-verification checks (`--verify-claims`)](#fact-verification-checks---verify-claims)
- [Known hallucination categories](#known-hallucination-categories)

## Frontmatter checks

| ID | Check | Rule | Source |
|---|---|---|---|
| F1 | `name` exists | Frontmatter has non-empty `name:` field. | Anthropic |
| F2 | `name` format | Lowercase letters, numbers, hyphens only. Max 64 chars. | Anthropic |
| F3 | `name` reserved words | Must not contain "anthropic" or "claude". | Anthropic |
| F4 | `description` exists | Frontmatter has non-empty `description:` field. | Anthropic |
| F5 | `description` length | ≤1024 characters. | Anthropic |
| F6 | `description` person | Third person. Reject if it contains "I can", "I will", "you can use this". | Anthropic |
| F7 | `description` WHEN clause | Must contain "Use when" or equivalent trigger phrasing. | Anthropic |
| F8 | No XML tags in frontmatter | Reject `<` followed by alpha char. | Anthropic |

## SKILL.md body checks

| ID | Check | Rule | Source |
|---|---|---|---|
| B1 | Body length ≤500 lines | Hard ceiling. Anthropic's published target. | Anthropic |
| B2 | Body length ≤200 lines (warn) | Soft target for book-derived skills. Warning, not failure. | book-to-skill |
| B3 | Has H1 | First non-frontmatter line is `# <name>`. | convention |
| B4 | Has "When to invoke" or equivalent | A section that explicitly enumerates triggers. | community |
| B5 | Has reference section | A section that lists `references/` files (so Claude knows the on-demand surface). | Anthropic (progressive disclosure) |
| B6 | No time-sensitive content | Reject strings like "as of YYYY", "before/after <month YYYY>" in flowing prose. | Anthropic |

## Reference file checks

| ID | Check | Rule | Source |
|---|---|---|---|
| R1 | All linked files exist | Every `[…](…)` link in SKILL.md resolves to a file in the skill dir. | Anthropic |
| R2 | One-level reference depth | Files linked from SKILL.md must not themselves link to other reference files (one level deep). | Anthropic |
| R3 | TOC on long references | Any reference file >100 lines must have a `## Contents` section in its first 25 lines. | Anthropic |
| R4 | Chapter files have H1 | Each `references/chapters/*.md` starts with `# Chapter <N> — <Title>` or similar. | convention |
| R5 | Index has named-construct table | `references/index.md` includes a "Named-construct index" table mapping concepts → chapter files. | book-to-skill |
| R6 | Glossary alphabetical | `references/glossary.md` entries appear in alphabetical order. | book-to-skill |
| R7 | Evals count | `references/_evals.md` has exactly 3 scenarios (look for `## Eval <N>` headings). | Anthropic |

## Structural checks

| ID | Check | Rule | Source |
|---|---|---|---|
| S1 | Forward slashes only | No backslashes in any file path inside markdown. | Anthropic |
| S2 | No `book.md` monolith | A single `references/book.md` >50KB is the anti-pattern. Reject. | book-to-skill |
| S3 | Chapter split exists | `references/chapters/` directory exists with ≥3 files for book-derived skills. | book-to-skill |
| S4 | No empty directories | Empty `assets/`, `scripts/`, `chapters/` should be removed unless explicitly populated. | hygiene |

## Content checks

| ID | Check | Rule | Source |
|---|---|---|---|
| C1 | Practitioner voice in SKILL.md | Reject phrases like "The book teaches", "The author argues", "The text explains" — switch to "Use X when Y" form. | book-to-skill |
| C2 | Named constructs in description | Description should list ≥3 named constructs (book-specific terms). Warning if fewer. | book-to-skill |
| C3 | "What this is not" section | SKILL.md should have an anti-scope section. Warning if missing. | community |
| C4 | No generic-template artefacts | Reject strings like "Look up API references", "Find code examples and implementation patterns", "complete documentation structure" — these are skill-seekers boilerplate leftovers. | community |

## Book-specific checks

| ID | Check | Rule | Source |
|---|---|---|---|
| K1 | Chapter file count plausible | Book skill should have ≥5 chapter files. | book-to-skill |
| K2 | Glossary present | `references/glossary.md` exists. | book-to-skill |
| K3 | Index present | `references/index.md` exists. | Anthropic (progressive disclosure) |
| K4 | Evals present | `references/_evals.md` exists. | Anthropic |

## Fact-verification checks (`--verify-claims`)

Optional mode that fact-checks SKILL.md and derivative reference files against `references/chapters/`. Run only when chapters exist (book skills). Requires `python3 audit_skill.py <dir> --verify-claims`.

| ID | Check | Rule | Source |
|---|---|---|---|
| V1 | Constructs verbatim in source | Every Title-Cased multi-word phrase in SKILL.md (excluding scaffolding and verb-leads) must appear verbatim in at least one chapter file. Misses = candidate hallucinations or working names that need `*(working name; not from book)*` flag. | session-derived (buy-back-your-time v1 "Saviour"/"Superhero" hallucination would have been caught here) |
| V2 | Formulas verbatim in source | Numeric formulas in SKILL.md (e.g. `pay ÷ 2,000`, `÷ 4`) must appear in at least one chapter. Catches off-by-N errors. | session-derived (Buyback Rate was originally `÷ 8000) ÷ 4` — off by 4×) |
| V3 | List members verbatim in source | For every bold-name enumerated list in SKILL.md (`**Name** (gloss), **Name** (gloss), ...`), every member must appear verbatim in at least one chapter. | session-derived (the 7 Pillars "family/faith/fitness/fun/future" hallucination) |
| V4 | Derivative-file constructs verbatim | Every Title-Cased construct that appears in `references/index.md`, `references/frameworks/index.md`, or `references/glossary.md` must also appear verbatim in some chapter. Catches **derivative-file re-hallucination** — a parallel subagent rewriting an index with the wrong list even after SKILL.md is corrected. | session-derived (parallel subagent re-introduced the wrong 7 Pillars list in `frameworks/index.md` v1) |

**Limitations.**
- V1/V4 use a Title-Case regex and a verb-lead skip list — false positives are still possible. Treat misses as *candidates* for review, not guaranteed bugs.
- **Recurring V1 false-positive — author name in source attribution.** When a SKILL.md says *"Source: Author Name, *Book Title* (Publisher, Year)"*, the author's name will fail V1 because EPUBs typically have separate copyright/title pages that don't appear in chapter content. Examples: `Matthew Walker`, `Yuval Noah Harari`, `Sun Tzu`. Eyeball the failing string — if it's clearly attribution, accept the miss as a paraphrase. **Do not silently ignore other V1 misses on this basis** — verify before dismissing.
- **Recurring V4 false-positive — intentional external citations.** Pairing-sources tables, further-reading lists, and "compare with" sections deliberately cite sources *outside* the book (Amnesty reports, journal articles, other authors). V4 will flag every Title-Case external title as re-hallucination risk. Eyeball each flagged string — if it's clearly an external citation inside a clearly-labelled section, accept the miss. **The same caveat applies: verify before dismissing.** If the section isn't clearly labelled (`## Pairing sources`, `## Further reading`), label it before dismissing the V4 hits.
- V2's formula regex matches `digit op digit` patterns. Some books express formulas in prose ("divide by two thousand"); V2 will not see those.
- V3 requires the list to use the `**Bold** (gloss), **Bold** (gloss), ...` pattern. Lists rendered as `- bullet` items are not currently captured.
- A clean V1–V4 pass does **not** prove factual accuracy — it proves no claim disagrees with the corpus. A claim absent from both SKILL.md and the chapters still slips through.

## Known hallucination categories

When a skill is derived from a source (book, paper, API doc), LLM-driven synthesis hits three recurring failure modes. The fact-verification checks above target these directly.

| Category | Example from session | Detection |
|---|---|---|
| **Wrong numeric formula** | Buyback Rate written as `(pay ÷ 8,000) ÷ 4` — off by 4× from the book's `(pay ÷ 2,000) ÷ 4`. The off-by-N error is plausible because the shortcut form is also `pay ÷ 8,000` (one division, not two). | V2 (formulas verbatim) |
| **Fabricated enumerated list** | Time Assassins listed as Staller / Speed Demon / Supervisor / **Saviour** / **Superhero** — last two are LLM completions filling slots; book says **Saver** / **Self-Medicator**. | V3 (list members verbatim) |
| **Fabricated framework membership** | 7 Pillars of Life listed as family / faith / fitness / friends / finances / fun / future — alliterative pattern from LLM training; book says **Health, Hobbies, Spirituality, Friends, Love, Finances, Mission**. | V1 + V3 (each member verbatim) |

**Derivative-file re-hallucination.** Even after fixing v1, a parallel subagent may re-introduce the wrong list in a sibling file (e.g. `frameworks/index.md`) because it didn't grep before writing. Always run V4 on multi-file skills.

**The rule that prevents these:** *"Verbatim quotes must be exact — grep the chapter file to pull them. Do not paraphrase and tag as a quote."* Encode this in every subagent prompt and in workflow.md Stage 3.5.

## Severity levels

- **FAIL** — must fix before declaring done. Auditor exits non-zero.
- **WARN** — should fix but skill is usable. Auditor reports and continues.
- **INFO** — observational. Auditor mentions but doesn't gate on.

The script categorises each check; defaults are listed in the script's source.

## How to use this checklist when auditing an existing skill

The user may invoke audit-mode on a skill that wasn't built by this skill (e.g. an older skill, one from a community pack, one written by hand). In that case:

1. Run the script — it'll surface every FAIL/WARN regardless of origin.
2. For each finding, propose the concrete fix (don't apply destructively without OK).
3. Some checks are book-specific (K1–K4); they're irrelevant for non-book skills. The script will skip K-checks if `references/chapters/` is absent.

## Out-of-scope (intentionally not audited)

- **Skill activation behaviour** — whether Claude actually fires the skill on relevant prompts. That requires running the evals in a fresh session. The script can lint structure but not behaviour.
- **Cross-skill conflicts** — whether two skills compete for the same triggers. Requires the full skill inventory.
- **Semantic accuracy of paraphrased prose** — V1–V4 verify that named constructs, formulas, and list members appear verbatim. They cannot check whether a paraphrased explanation correctly represents the source's argument. Closing this gap requires the human review at Checkpoint 2.

Partially in scope as of `--verify-claims`:

- **Synthesis quality** — V1–V4 now catch the three recurring hallucination categories (wrong formula, fabricated list, fabricated framework membership). The mode is opt-in (`--verify-claims`) and requires `references/chapters/` to exist.

For everything still out-of-scope, run the evals manually (Anthropic recommendation) and observe.

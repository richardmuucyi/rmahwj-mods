# Build workflow — 5 stages, 2 checkpoints

Script paths in this file are relative to this skill's folder.

## Contents

- [Known upstream tool bugs](#known-upstream-tool-bugs-read-first)
- [Stage 1 — Verify input](#stage-1--verify-input)
- [Stage 2 — Extract chapters](#stage-2--extract-chapters)
- [Checkpoint 1](#checkpoint-1--confirm-chapter-mapping)
- [Stage 3 — Synthesize SKILL.md](#stage-3--synthesize-skillmd)
- [Stage 3.5 — Verify against source](#stage-35--verify-against-source-grep-before-claim)
- [Checkpoint 2](#checkpoint-2--review-the-skillmd-draft)
- [Stage 4 — Build references/](#stage-4--build-references)
- [Stage 5 — Audit](#stage-5--audit)

Each stage lists its **goal**, **steps**, and **completion criteria**. Do not advance past a checkpoint without the user's explicit OK.

---

## Known upstream tool bugs (read first)

Before using third-party converters like [`skill-seekers`](https://github.com/yusufkaraaslan/Skill_Seekers), be aware of these confirmed traps:

1. **`skill-seekers create -o <dir>` ignores the `-o` flag for EPUB inputs.** Output is written to `./output/` relative to the *current working directory*, regardless of what you pass. **Workaround:** `cd ~/tmp/scratch && skill-seekers create <epub>` — never run it from a directory whose parents you care about (e.g. an Obsidian vault, a git repo).
2. **`skill-seekers` local-enhancement step looks at the `-o` path** which (per bug #1) never actually contains the build output, so enhancement crashes silently and you get the raw extraction. The default un-enhanced SKILL.md is generic boilerplate ("Use this skill when you need to look up API references and find code examples"). **Workaround:** assume enhancement failed; plan to write SKILL.md by hand using `scripts/extract_epub.py` (this skill's bundled extractor) for the chapter shards. Don't trust skill-seekers' SKILL.md.
3. **`skill-seekers` extracts EPUB content as a single flat blob** with `**📄 Source: Section N**` markers (EPUB spine items), not `# Chapter N` headings — chapter structure is lost. Use `scripts/extract_epub.py` instead; it preserves headings and quarantines TOC/cover spine items.

These bugs are why `extract_epub.py` and the explicit Stage 3.5 verification step exist.

---

## Stage 1 — Verify input

**Goal:** confirm the input is a valid EPUB with chapter structure.

**Steps:**

1. Check the file exists at the given path and ends in `.epub`.
2. Check it's a valid ZIP: `unzip -l <path> | head -20`. EPUBs are ZIPs.
3. Check for an OPF manifest (typically `OEBPS/content.opf` or similar): `unzip -l <path> | grep -i '\.opf'`.
4. Propose a slug from the filename — lowercase, hyphens only, strip parentheses and author names. e.g. `Surrounded by Idiots (Thomas Erikson).epub` → `surrounded-by-idiots`. Ask the user to confirm or override.
5. **Pre-publication / NetGalley check.** After Stage 2 extraction completes, grep the first 3–4 spine files for: `uncorrected ebook file`, `do not quote for publication`, `netgalley`, `advance reader`, `ARC`, `uncorrected proof`. If any hit, the EPUB is a pre-publication copy. Note this at Checkpoint 1, and plan to add a caveat in SKILL.md's source-attribution paragraph: *"Built from a NetGalley uncorrected pre-publication EPUB — substantive content is settled, but exact wording of specific passages should be checked against the published edition before publication-grade quoting."* Also: pre-pub EPUBs often have generic spine names (e.g. `Hara_netgalley-N` rather than chapter titles). If so, peek at the first lines of each kept file to extract real chapter titles before Checkpoint 1 — do not trust spine metadata alone.
6. **Author / translator spot-check.** Read 5–10 lines from the first real chapter and verify the prose style matches what the filename or OPF metadata claims. Translations of classics in particular: Wade-Giles romanisation (`Ts`ao Kung`, `CH`I`) → likely Giles 1910 *Sun Tzu*; modern Pinyin (`Cao Cao`, `qi`) → Cleary 1988 or Griffith 1963. Public-domain works are routinely repackaged by many publishers, and EPUB filenames lie. If the metadata disagrees with the prose, label the skill by the *actual* translator/author you can identify from the text, flag the mismatch at Checkpoint 1, and let the user decide which attribution to use.

**Completion criteria:** valid EPUB, slug confirmed, pre-pub status known, author/translator confirmed against actual prose.

**Failure modes:** file is DRM-protected (extraction will produce garbage), file is a PDF with `.epub` extension (mime mismatch), no chapter structure detectable. Stop and tell the user.

---

## Stage 2 — Extract chapters

**Goal:** produce per-chapter markdown files in a tmp directory + a manifest of what was extracted.

**Steps:**

1. Run `python3 scripts/extract_epub.py <epub-path> <tmp-out-dir>`.
2. The script writes:
   - One `.md` file per spine item (foreword, intro, ch1..chN, appendices) into `<tmp-out-dir>/`.
   - A `_manifest.json` listing each file's slug, raw title, character count.
3. Read the manifest. Identify:
   - Front matter (foreword, preface, introduction) — usually 1–3 items.
   - Main chapters — typically 5–25 items.
   - Back matter (appendices, glossary, further reading) — 1–5 items.
4. Propose slugs for each chapter that combine **position + meaningful keyword**: `05-ch04-red-behavior.md`, not `chapter4.md`. Position prefix keeps file listing in book order; keyword makes the slug self-describing.

**Completion criteria:** manifest exists, slugs proposed, totals look sane (no chapter is 0 chars or 500KB).

---

## Checkpoint 1 — confirm chapter mapping

**Show the user:**

- The slug for the skill.
- The proposed per-chapter file mapping as a table (position prefix · proposed filename · raw title · char count).
- Any anomalies flagged (suspiciously short/long chapters, missing titles, OCR artefacts).

**Ask:**

- Are the chapter splits right? (Sometimes EPUB spine groups multiple chapters into one file or vice versa.)
- Are the proposed slugs sensible? (User may want different keywords.)
- Skip any chapters? (Copyright pages, "About the author" boilerplate are usually skippable.)

**Do not proceed without confirmation.**

---

## Stage 3 — Synthesize SKILL.md

**Goal:** write a SKILL.md that follows [skill-md-template.md](skill-md-template.md) and passes every audit check.

This is the highest-leverage stage. **Synthesise, do not summarise.** A summary describes what the book says; a synthesis tells Claude how to use the book's ideas in conversation.

**Steps:**

1. **Read strategically — do not load all chapters into context.** Target reads:
   - Foreword + Introduction (full) → origin story, the book's core claim.
   - Each "core framework" chapter (full) → typically the named constructs (in a four-color book, this is the four color chapters; in a delegation book, this is the named tools).
   - Conclusion / final chapter (full) → author's distilled takeaway.
   - Other chapters: skim titles + first paragraph; load fully only if needed for a named construct.

2. **Identify the named constructs.** These become the description triggers AND the section headings in SKILL.md. Watch for:
   - Title-cased terms (Buyback Rate, DRIP Matrix, Camcorder Method).
   - Acronyms the author defines (DISA, DISC, OARS, GROW).
   - Repeated metaphors or labels (the four colors, the five Time Assassins, the seven Pillars of Life).

3. **Write the description.** Format:
   > Apply <author>'s <named-framework-cluster> from <book title> (<publisher>, <year>). Use when <trigger 1>, <trigger 2>, <trigger 3>, or asks about any named construct from the book (<list named constructs>). Do NOT use for <negative triggers>.

   Constraints (Anthropic):
   - Third person ("Apply..." not "I help you...").
   - ≤1024 characters.
   - Include WHAT + WHEN + named keyword triggers.
   - Include negative triggers if the skill could be mis-fired.

4. **Write the body.** Use [skill-md-template.md](skill-md-template.md). Required sections:
   - One-paragraph framing (source + lineage).
   - **When to invoke** — bullet list of triggers, plus "Do not invoke for X".
   - **Core frameworks** — one line each, named constructs front-loaded.
   - **Quick-profiling / diagnostic table** if the book has one (DISC has its profiling table; delegation books have the DRIP matrix).
   - **Diagnostic anecdotes** — pull the book's memorable concrete stories. These do more work than abstract trait lists.
   - **How to apply** — concrete tactics per framework.
   - **How to use this skill in conversation** — numbered rules for Claude's behaviour.
   - **What this skill is not** — anti-scope, caveats.
   - **Reference** — pointers to `references/` files.

5. **Stay under 200 lines if possible, 500 hard ceiling.** If you're over, push content into `references/` files.

**Completion criteria:** draft SKILL.md exists; all named constructs from the book are mentioned in either the description or a section heading.

---

## Stage 3.5 — Verify against source (grep-before-claim)

**Goal:** before showing the draft to the user, eliminate hallucinations.

This stage is non-negotiable. The three recurring failure modes — wrong numeric formula, fabricated enumerated list, fabricated framework membership — are why this step exists. See [audit-checklist.md § Known hallucination categories](audit-checklist.md#known-hallucination-categories) for the catalogue.

**Steps:**

1. **Run the verifier:**
   ```bash
   python3 scripts/audit_skill.py <skill-dir> --verify-claims
   ```
   This greps every Title-Cased construct, numeric formula, and bold-enumerated-list member in your SKILL.md against `references/chapters/`. Each miss is a FAIL.

2. **For every V1/V2/V3/V4 FAIL,** decide:
   - **Hallucination** → delete or correct from SKILL.md using the verbatim wording from the chapter.
   - **Working name** (the practice exists in the book but isn't named by the author) → flag in-place with `*(working name; not from book)*` immediately after the term. Example: `**Transformation Sheet** *(working name; the book describes the practice in Ch 6 without naming the artefact)*`.
   - **Paraphrase** (e.g. "Test-First Hiring" vs the book's `"Test-First" Hiring Method`) → either match the book's exact wording or accept the paraphrase. Both are valid; the decision belongs to the human at Checkpoint 2.

3. **Re-run the verifier** until V1–V4 pass or every remaining FAIL is an accepted working-name / paraphrase decision.

**The rule for parallel subagents** (Stage 4): *"Verbatim quotes must be exact — grep the chapter file to pull them. Do not paraphrase and tag as a quote."* Encode this in every subagent prompt. Without it, a parallel agent will re-introduce the wrong list in a derivative file even after SKILL.md is corrected (the "derivative-file re-hallucination" failure).

**Completion criteria:** verifier passes (or all remaining FAILs are documented working-name / paraphrase exceptions).

---

## Checkpoint 2 — review the SKILL.md draft

**Show the user:**

- The full SKILL.md draft.
- A short note on what was synthesised vs what's in references/ (token economy).
- Any sections you're unsure about.

**Ask:**

- Does the description's trigger list match how you'd actually invoke this?
- Are the named constructs the right ones? (Sometimes the book has 10 named frameworks but only 3 are useful in practice.)
- Anything missing or over-included?

**Do not proceed without confirmation.** Make requested revisions before stage 4.

---

## Stage 4 — Build `references/`

**Goal:** populate `references/` so progressive disclosure works.

**Steps:**

1. **`references/chapters/`** — copy each chapter file from the tmp dir, applying:
   - Final slug from Checkpoint 1.
   - Rewritten H1 with meaningful title (not just "# 4" from the EPUB extraction).
   - No other content changes (preserve original prose for verbatim quoting).

2. **`references/index.md`** — open with a `## Contents` section so a `head -100` preview reveals full scope. Then:
   - Group chapters into the book's structural parts (front matter, parts I-IV, back matter).
   - Table per group: filename · what's in it.
   - **Anchor-quote pattern (recommended).** When a chapter has a single signature line, weave it into that chapter's row in the "what's in it" column rather than splitting quotes into a separate table. e.g. nexus's Ch 1 entry includes the verbatim *"information puts things in formation"* tied to that chapter. The reader sees the quote *and* its anchor in one place; the alternative (separate `## Key quotations` table) loses that binding.
   - **Named-construct index** at the bottom: construct/question → chapter filename. This is the lookup the orchestrator SKILL.md points at.

3. **`references/glossary.md`** — alphabetical (A–D, E–H, …). One entry per term:
   - Bold the term.
   - One-line definition (≤25 words).
   - Cross-reference: `→ <chapter-filename>`.
   - Include synonyms and acronyms (DISA / DISC).

4. **`references/_evals.md`** — three test scenarios. Each:
   - **Query** — verbatim user prompt that should trigger the skill.
   - **Expected behaviour** — checklist of what should happen (skill activates, loads chapter X, answer covers Y).
   - **Failure modes** — what's wrong if the eval fails.

   Pick evals that exercise different intents: one recall query, one application/adaptation query, one provenance/"what does the author say" query.

5. **(Optional) Pairing sources for flagship case studies.** Some books build a signature case study that users will be tempted to slogan-quote (nexus's Facebook–Myanmar–Rohingya case; Walker's WHO/cancer claim; Kiyosaki's real-estate anecdotes). For these, add a `## Pairing sources for the <case> case` section to `references/index.md` listing 3–5 primary or specialist sources the user should pair with the book's framing.

   **Hard constraint: pairing sources must be human-supplied at Checkpoint 2 — the LLM building the skill MUST NOT auto-synthesise this list.** Reason: the build LLM will confidently name plausible-sounding sources from training data, some of which will be wrong (e.g. citing an author's book on the wrong country). If the human can't supply specific titles at Checkpoint 2, skip the section. Better to omit it than to hallucinate it.

   When you do produce the section, warn explicitly in your handoff: *"V4 will fire on these external citations — that's expected, not a defect."* See `audit-checklist.md` Limitations for the rule.

**Completion criteria:** all four reference artefacts exist and link correctly from SKILL.md. Pairing sources are present only if the human supplied them at Checkpoint 2.

---

## Stage 5 — Audit

**Goal:** verify the skill passes every check before declaring done.

**Steps:**

```bash
python3 scripts/audit_skill.py <skill-dir>
```

The script outputs a checklist with PASS/FAIL per item. For each FAIL:

1. Read the failing rule in [audit-checklist.md](audit-checklist.md).
2. Apply the mechanical fix (split a too-long file, add a TOC, fix a broken link, etc.).
3. Re-run the auditor.

**Completion criteria:** every check is PASS.

Then run the three evals from `_evals.md` in a fresh Claude Code session to verify the skill *behaves* well, not just *audits* well.

**Final report to user:**

- Skill path.
- Audit results (all PASS).
- The 3 eval queries to test in a fresh session.
- Final line count + reference file count.

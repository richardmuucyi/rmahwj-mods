# Evals — skill-uplift

## Trigger evals (should fire skill-uplift)

- "modernise my deep-dive skill with current best practices"
- "level up my anki skill — I want it to apply the latest spaced-repetition science"
- "harden my journal-capture skill against the latest skill-authoring guidance"

## Trigger evals (should NOT fire skill-uplift)

- "create a new skill for generating brand slide decks" → skill-creator (creating from scratch, not improving an existing skill)
- "audit this SKILL.md for structural issues" → ebook-to-skill (structural-only audit, no web research, no domain uplift)
- "check all my skills for private info leaks before I publish them" → skill-audit (security/leak audit, not best-practice uplift)
- "the vault-lint skill just discovered its own gap — write it back into the skill mid-run" → self-improving-skills (mid-run discovery write-back during an active skill session, not a user-initiated uplift)

## Behaviour evals

### Eval 1 — Lens proposal before research

**User prompt:**
> "modernise my deep-dive skill with current best practices"

**Expected behaviour:**
- Reads `deep-dive/SKILL.md` and its references; distils one-line purpose, artifact type (yes — produces HTML walkthroughs/tutorials), and subject domain (pedagogy / interactive learning design).
- **Proposes lenses before doing any research** — does NOT immediately launch a web search.
- Selected lenses must include: (1) Agent / Skill-Engineering (always required), (2) Output & Interaction Design (because the skill emits a human-consumed HTML artifact), and at least one domain lens from pedagogy/instructional-design.
- Presents the selected lenses to the user and asks them to confirm before proceeding to Step 3 (build research prompts).
- Does NOT auto-launch `deep-research` without user choosing Mode A or Mode B.

**Failure modes to watch for:**
- Immediately running a web search without proposing lenses first.
- Omitting the Output & Interaction Design lens (the skill clearly emits HTML artifacts).
- Proposing to edit the skill's files before research is complete.

---

### Eval 2 — Validations/Gaps/Net-new buckets with no auto-apply

**User prompt** (after lenses confirmed and research complete):
> "ok apply the findings"

**Expected behaviour:**
- Presents findings sorted into exactly three named buckets: **Validations**, **Gaps**, **Net-new** — never a flat list.
- Each finding maps to a verified source (no fabricated citations).
- Proposes edits as a reviewable plan/diff — does NOT write to any file without explicit user approval.
- Confines proposed edits to the target skill's directory (`skill-uplift/` or whichever skill was targeted); does not touch unrelated files.
- If the Skill-Engineering lens flagged the `description:` field as too heavy, explicitly recommends running `/shrink-skill-desc <skill>` afterward rather than hand-editing the description in this step.

**Failure modes to watch for:**
- Auto-applying edits to SKILL.md or any reference file without approval.
- Mixing Validations / Gaps / Net-new into an undifferentiated list.
- Proposing to edit the `description:` field directly instead of delegating to `shrink-skill-desc`.
- Touching files outside the target skill's directory.

---

### Eval 3 — Description-change recommendation routes to shrink-skill-desc

**User prompt:**
> "the anki skill description feels too long and mis-triggers — fix it as part of the uplift"

**Expected behaviour:**
- Acknowledges that the `description:` field is out of scope for hand-tuning within `skill-uplift`.
- Explicitly recommends running `/shrink-skill-desc anki` as a follow-on step after uplift edits are approved — explains that `shrink-skill-desc` optimises the description empirically via a trigger-eval loop rather than by research opinion.
- May note that uplift research tends to inflate descriptions (adding new trigger phrases for new capabilities), so re-tightening post-uplift is the natural last step.
- Does NOT produce a rewritten `description:` string as part of the uplift output.

**Failure modes to watch for:**
- Rewriting the description string directly as part of the uplift findings.
- Silently including a new `description:` in the proposed diff.
- Failing to name `shrink-skill-desc` as the delegated tool.

---

## Running these evals

These are written as conversational tests, not automated assertions. To run:

1. Open a fresh Claude Code session (no prior context that primes the skill).
2. Paste the user prompt verbatim.
3. Compare the response to the expected behaviour.
4. Score: pass if all expected behaviours are hit and no failure modes triggered; fail otherwise.

If a trigger eval misfires, the fix is usually: (a) tighten the `description:` NOT-for list to name the boundary case, or (b) run `/shrink-skill-desc skill-uplift` to re-calibrate the description on the eval set. If a behaviour eval fails, trace back to the SKILL.md workflow step that was skipped or misexecuted.

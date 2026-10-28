---
name: self-improving-skills
description: Governed self-improvement loop for a skill — invoke when a skill should learn/update itself over time, when an agent is about to write a harvested discovery back into a skill to extend or improve it, or when designing a self-improving / self-modifying skill with a feedback loop. Enforces capture-is-free / promotion-is-gated. NOT for one-off manual skill edits, creating a new skill (`skill-creator`), researching best-practices to apply (skill-uplift), or tuning a description (shrink-skill-desc).
---

# Self-Improving Skills (governed)

## When to invoke

- A skill run just burned heavy tokens on unscripted mechanical work (≥5 sequential collection Reads / ≳50k tokens of parse-filter-count-group) → capture a **scriptability learning**; see the contract § Scriptability sentinel

## What this skill is not

- **One-off manual skill edits** — edit the skill file directly.
- **Creating a new skill** — use `skill-creator`.
- **Researching best-practices to apply** — use `skill-uplift`.
- **Tuning a description** — use an empirical trigger-eval loop: `shrink-skill-desc` where you have it, else `skill-creator`'s description optimisation.

## Reference

- `references/self-improvement-loop.md` — the full contract: rules, rationale, six promotion gates, adoption block

The **on-demand entry point** to the governed self-improvement loop: use it whenever a skill should learn from a run and feed that back into itself — safely, without drift, leakage, or trigger corruption.

> The contract lives in **one place**: [`references/self-improvement-loop.md`](references/self-improvement-loop.md). This skill is the **trigger + checklist** — it routes to the contract and does not restate it (single source of truth).

## On invocation

1. **Read the contract** — `references/self-improvement-loop.md` (full rules, rationale, adoption block).
2. **Identify the demand:**
   - **Capture** — the agent learned something useful → append it to the target skill's `learnings/NNNN-<slug>.md`. *Always allowed; nothing else required.*
   - **Promotion** — a captured learning should enter the target skill's canonical `SKILL.md`/`references` → run the six gates below.
   - **Design** — wire the loop into a skill that lacks one → add the adoption block + create `learnings/` and `_self-improve-log.md`.
3. **Enforce the six promotion gates** (detail in the contract):
   - [ ] **Verified** — corroborated, or provably mechanical (not a one-off hunch)
   - [ ] **Privacy-clean** — no person / employer / project / credential / internal path harvested in
   - [ ] **Non-destructive** — supersede with a `*(Superseded YYYY-MM-DD)*` marker; never silent-overwrite
   - [ ] **Trigger-safe** — no freehand `description` edits → route to an empirical trigger-eval loop (`shrink-skill-desc`, or `skill-creator`'s description optimisation)
   - [ ] **Scope-confined** — edits land only inside the target skill's own directory
   - [ ] **Regression-checked** — passes the skill's eval, or flag the promotion as unverified-by-eval
4. **Auto-apply only** changes that are provably-mechanical **and** privacy-clean **and** non-destructive; everything substantive is **propose → approve**.
   - **Stage a propose → approve change instead of editing the live skill:** `python scripts/stage_skill_change.py stage <skill> --with <sibling skills>` copies it to a scratch folder (link every sibling skill the tests import; a missing one shows as a ModuleNotFoundError), then `diff`, `test STAGE -- <the skill's test command>` and, after the user says apply, `apply STAGE` (it refuses when a real file changed since staging, and keeps a backup). Details: the script's docstring.
5. **Log** the promotion to the target skill's `_self-improve-log.md` (append-only → reversible).

## Two ways the loop loads

- **On demand** — invoked directly via this skill (the always-in-context trigger surface). This is what makes the contract reachable without an adopting skill in play.
- **Inline** — an adopting skill's own `SKILL.md` links the contract, so it loads automatically whenever that skill runs.

Both paths apply the *same* contract; this skill just guarantees it can also fire on request.

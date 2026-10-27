# Iteration loop — pseudocode + stop conditions

Step 3 of `SKILL.md` runs a two-phase iteration. This file is the detailed pseudocode so the body of `SKILL.md` can stay short. Read this file before you enter Step 3 if you have not run the loop recently.

## Total iteration budget

**Total ≤ 5 iterations.** The header in `SKILL.md` says "max 5"; the budget is split:

- **Phase A (structural audit) — up to 4 iterations.** Re-render after each fix. Stop early when the self-review verdict has zero CRITICAL items.
- **Phase B (aesthetic refinement) — up to 1 iteration**, only when `stakeholder_render` resolves to a theme. Re-render with the theme, dispatch the fresh-eyes subagent, apply any returned CRITICAL fixes once, re-render. The subagent verdict on the second render is final.

If Phase A consumes all 4 iterations without going clean, Phase B still runs once iff a theme was chosen — the goal there is to ship the best version we have, not to gate on a perfect Phase A.

## Phase A — pseudocode

```
iteration = 0
last_known_good_source = current_source  # fallback when a fix breaks rendering
consecutive_render_failures = 0

while iteration < 4:
    iteration += 1

    # Render naked (no theme). The "naked" render is what humans will see if
    # they ever copy the source into a non-themed renderer, and it surfaces
    # structural problems that themed renders sometimes mask.
    render(current_source, tmp.png, theme=None)

    if render failed:
        consecutive_render_failures += 1
        if consecutive_render_failures >= 2:
            ABORT — revert to last_known_good_source, report the failing source excerpt
        # Revert to last good and tell self-review which fix not to retry.
        current_source = last_known_good_source
        re-run self-review with hint "do not repeat fix <last fix_key>"
        continue
    consecutive_render_failures = 0

    # Self-review pass.
    read references/common-issues.md
    if reference_basename and references/diagram-types/<reference_basename>.md
       exists and is not a stub:
        also read it
    read tmp.png
    walk every entry in the catalogue, check whether the symptom is present
    produce verdict: { critical: [...], polish: [...], fix_recommendations: [...] }

    if verdict.critical is empty:
        last_known_good_source = current_source
        BREAK to Phase B   # structure is clean
    else:
        last_known_good_source = current_source  # this version rendered, even if imperfect
        for each fix_recommendation:
            recipe = lookup recipe in known-good-fixes.md by fix_key
            apply recipe to current_source
        # loop continues — re-render, re-review
```

## Phase B — pseudocode

```
if stakeholder_render is False:
    SKIP Phase B   # no themed render requested
else:
    render(current_source, themed.png, theme=themes/<name>.json)
    if render failed:
        ABORT Phase B — revert to last_known_good_source, report the failure
        # Phase A's last good source is still the deliverable

    dispatch fresh-eyes subagent (see agents/reviewer.md) with themed.png
    parse the JSON verdict

    if verdict == ship_ready:
        BREAK — Phase B passed first try
    else:
        for each CRITICAL fix returned:
            apply recipe to current_source (source-level only;
            the renderer itself is fixed — all themeable knobs live in the theme JSON)
        re-render with theme
        # Subagent ran once. We do not re-dispatch — the second render with
        # CRITICALs applied is the deliverable, even if the subagent might
        # still find polish issues. This is intentional: one subagent dispatch
        # per Phase B keeps cost bounded and avoids rabbit-holing.
```

## Stop conditions (summary)

- **Success**: Phase A clean + (Phase B subagent says ship_ready, OR Phase B not requested, OR Phase B's one round of CRITICAL fixes was applied).
- **Iteration cap**: 5 rounds total. Write the last-known-good version. Surface any unresolved CRITICAL items prominently in the completion message — don't claim success when CRITICAL items remain.
- **Render-failure cap**: 2 consecutive render failures in Phase A. Abort, revert to `last_known_good_source`, report with the failing source excerpt.

## Why two phases instead of one

A single themed render hides structural problems behind aesthetic polish. A naked render is honest about clipping, alignment, and edge routing. Once those are clean, the theme is a separate concern — palette, typography, spacing — and the fresh-eyes subagent reviews the themed render with no memory of the structural battles you fought in Phase A. Decoupling these passes is what makes the skill consistently produce spec-quality output instead of "looks fine until you look hard."

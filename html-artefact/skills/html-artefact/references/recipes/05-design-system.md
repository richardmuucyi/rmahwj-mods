# 05 — Living design system

**Category:** Design & Prototypes
**Reference HTML:** `references/thariq-examples/05-design-system.html`
**JS:** None (real-world version adds click-to-copy on swatches)

## Intent

Every design token (colour, type scale, spacing, radius, elevation) and every core component variant rendered on a single page. The result is portable — you paste it into future prompts as reference so subsequent artefacts stay consistent with the system.

## Example prompt

> Generate a design-system reference page from `src/styles/tokens.ts` and `src/components/`. Every colour as a swatch I can copy the hex from, the type scale, spacing tokens, radii, shadows, and a render of each core component (button, badge, card, input). Make it portable — I'll paste it into future prompts.

## Standard sections (in order)

1. **Header** — H1 ("Acme design system"), subtitle ("Generated from `src/styles/tokens.ts` on 2026-05-15")
2. **Colour** — `.swatch-group`s by role (Brand, Neutral, Status). Each group is a `.swatch-grid` of tiles, each tile printing the hex code on or below the swatch in mono
3. **Typography** — type-scale ladder. Show each step (display / heading / body / mono) with the px size in mono next to it
4. **Spacing** — `.space-token` rows. Each row shows the token name + a proportional bar visualising 4/8/16/24/32px
5. **Radius & Elevation** — `.radius-card` and `.shadow-card` samples. Each card actually has the radius / shadow applied so you can see the visual
6. **Core components** — every variant of `.button`, `.badge`, `.card`, `.input` rendered side-by-side

## Interactive elements

- **None in the reference demo.** A production-grade version should add click-to-copy on swatches — use clipboard-with-flash pattern (`shared-patterns.md` §2)

## JS patterns to copy

- **Optional: clipboard with flash() on swatch click** — adapt `shared-patterns.md` §2 to copy the hex code

## Distinctive styling

- **Each colour swatch is a tile** with the hex printed directly on it (white text on dark colours, dark text on light) — instantly screenshot-friendly
- **Spacing tokens visualised as actual proportional bars**, not just numbers. Easier to internalise the scale.
- **Section grouping is load-bearing** — Brand / Neutral / Status. Dumping all colours in one grid loses the meaning.

## Anti-patterns

- **Don't dump all tokens in one giant grid.** Group by role.
- **Don't omit usage notes.** Each swatch should have a one-line "use for …" under the hex.
- **Don't forget the date / source.** Subtitle says "generated from `src/styles/tokens.ts` on YYYY-MM-DD". Future readers need to know if it's stale.

## Variations

- **For one component's variants (not the whole system)** see recipe `06-component-variant-matrix.md`.
- **Use this artefact as a paste-in for future prompts** — Thariq's design-system-as-reference pattern. Drop the whole HTML into a follow-up prompt to keep new artefacts consistent.

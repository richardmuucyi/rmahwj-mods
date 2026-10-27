# Sankey diagram-specific failure modes

This file supplements `references/common-issues.md` for mermaid `sankey-beta` diagrams.

## Type-specific issues

### Links almost invisible on a dark theme

Each link group carries an inline `mix-blend-mode: multiply`. On white, multiply leaves the link colour as it is. On a dark ground it multiplies every link towards black.

**Detection:** on a dark render the nodes show but the flows between them are nearly black.
**Fix:** theme-level. zinc-dark sets `.link{mix-blend-mode:normal !important;}` in themeCSS (only `!important` beats an inline style). A new dark theme needs the same rule (`scripts/tests/test_theme_contrast.py`, `hardcoded_failures`).

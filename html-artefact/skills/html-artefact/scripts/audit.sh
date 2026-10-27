#!/usr/bin/env bash
# audit.sh — self-audit checks for the html-artefact skill
# Usage: bash scripts/audit.sh <path-to-artefact.html> [--folder] [--kraft-look]
# Exit 0 = no hard failure; exit 1 = the page loads something that is not allowed.
# --folder:     a page that is deliberately a folder (SKILL.md Step 2): relative files may sit beside it.
# --kraft-look: the page uses the optional kraft-and-clay look: run the palette check against it.
#
# Hard check  [1] loads            -> FAIL (exit 1). Allowed: Google Fonts, pinned scripts from the five Artifact CDNs.
# Soft checks [2] palette (only with --kraft-look), [3] display:none, [4] page contract -> WARN (exit stays 0)
#
# [1] and [2] read the page through scripts/audit_lib.py, not grep: a grep misses Google Fonts with href
# before rel, relative <script src>/<link>, external <img>, CSS url() and @import without url(), and it
# mistakes non-colours such as a PR number "#4888" for colours.

set -uo pipefail

FILE="${1:-}"
FOLDER=""
KRAFT_LOOK=""
for arg in "${@:2}"; do
  [[ "$arg" == "--folder" ]] && FOLDER="--folder"
  [[ "$arg" == "--kraft-look" ]] && KRAFT_LOOK="1"
done
if [[ -z "$FILE" ]]; then
  echo "Usage: $0 <path-to-artefact.html> [--folder] [--kraft-look]" >&2
  echo "  --folder  the page is deliberately a folder (video, frames, images beside it): relative files are allowed" >&2
  echo "            if they exist; remote URLs still fail." >&2
  exit 1
fi
if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c "import sys" >/dev/null 2>&1; then PY="$c"; break; fi
done

FAIL=0

# ── 1. External dependencies (hard) ──────────────────────────────────────────
echo "=== [1] Loads from outside the page ==="
if [[ -n "$PY" ]]; then
  "$PY" "$HERE/audit_lib.py" external "$FILE" $FOLDER || FAIL=1
else
  # Fallback with no python: the old grep. It misses attribute-order variants; say so.
  echo "(no python found; using the coarse grep fallback, which can miss 'href before rel' and relative files)"
  EXT=$(grep -vE 'fonts\.(googleapis|gstatic)\.com' "$FILE" | grep -E '(<script[^>]+src=|<link[^>]+(href=["'"'"']?(https?:)?//|rel=["'"'"']?stylesheet)|@import|<img[^>]+src=["'"'"']?(https?:)?//|url\(["'"'"']?(https?:)?//)' || true)
  if [[ -n "$EXT" ]]; then echo "FAIL — external dependency found:"; echo "$EXT"; FAIL=1; else echo "OK — no external dependencies"; fi
fi

# ── 2. Palette (soft) ────────────────────────────────────────────────────────
echo ""
echo "=== [2] Palette discipline (kraft look only: hex colours outside its families) ==="
if [[ -z "$KRAFT_LOOK" ]]; then
  echo "SKIP — not the kraft look (add --kraft-look to check the kraft-and-clay palette)"
elif [[ -n "$PY" ]]; then
  "$PY" "$HERE/audit_lib.py" palette "$FILE" || true
else
  echo "SKIP — palette check needs python"
fi

# ── 3. display:none orphan blocks (soft) ─────────────────────────────────────
# A top-level element (or any element) with display:none that isn't
# controlled by JS is dead content. Flag all occurrences for manual review.
echo ""
echo "=== [3] display:none orphan blocks ==="
HIDDEN=$(grep -nE 'display\s*:\s*none' "$FILE" || true)
if [[ -n "$HIDDEN" ]]; then
  echo "WARN — display:none occurrences (verify each is a JS toggle target, not dead content):"
  echo "$HIDDEN"
else
  echo "OK — no display:none found"
fi

# ── 4. Page contract (soft) ──────────────────────────────────────────────────
echo ""
echo "=== [4] Page contract (title, viewport, both themes, tokens) ==="
if [[ -n "$PY" ]]; then
  "$PY" "$HERE/audit_lib.py" contract "$FILE" || true
else
  echo "SKIP — contract check needs python"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "All hard checks passed."
else
  echo "One or more hard checks FAILED — review output above before shipping."
fi
exit $FAIL
